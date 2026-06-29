// Supabase Edge Function: whop-webhook
// Valida a assinatura do Whop (Standard Webhooks), marca o pedido como 'paid' e dispara:
//  - Facebook Conversions API (Purchase, dedup pelo event_id = order.id)
//  - UTMify Orders API (pedido pago + UTMs)
// Deploy com "Verify JWT" DESLIGADO.
// Secrets: WHOP_WEBHOOK_SECRET (ws_...), FB_CAPI_TOKEN, UTMIFY_API_TOKEN
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const WEBHOOK_SECRET = Deno.env.get("WHOP_WEBHOOK_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FB_PIXEL_ID = "28181409881448447";                 // público
const FB_CAPI_TOKEN = Deno.env.get("FB_CAPI_TOKEN") || "";
const UTMIFY_API_TOKEN = Deno.env.get("UTMIFY_API_TOKEN") || "";

const sb = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" };
const enc = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function hmacB64(keyBytes: Uint8Array, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

// Verificação Standard Webhooks (esquema usado pelo Whop).
// Tentamos algumas formas de derivar a chave a partir do secret ws_... para máxima compatibilidade.
async function verify(rawBody: string, h: Record<string, string>): Promise<boolean> {
  const id = h["webhook-id"]; const ts = h["webhook-timestamp"]; const sigHeader = h["webhook-signature"];
  if (!id || !ts || !sigHeader || !WEBHOOK_SECRET) return false;
  const signed = `${id}.${ts}.${rawBody}`;

  // assinaturas recebidas: "v1,xxxx v1,yyyy" (espaço separa, vírgula separa versão da assinatura)
  const provided = sigHeader.split(" ").map((p) => (p.includes(",") ? p.split(",")[1] : p));

  // chaves candidatas
  const afterPrefix = WEBHOOK_SECRET.startsWith("ws_") ? WEBHOOK_SECRET.slice(3) : WEBHOOK_SECRET;
  const candidates: Uint8Array[] = [enc.encode(WEBHOOK_SECRET)]; // bytes do secret completo (recomendado pelo doc)
  if (/^[0-9a-fA-F]+$/.test(afterPrefix) && afterPrefix.length % 2 === 0) candidates.push(hexToBytes(afterPrefix));
  try { candidates.push(Uint8Array.from(atob(afterPrefix), (c) => c.charCodeAt(0))); } catch (_) { /* não é base64 */ }

  for (const key of candidates) {
    const expected = await hmacB64(key, signed);
    if (provided.some((p) => p === expected)) return true;
  }
  return false;
}

async function sha256(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const fmtUTC = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

// cotação USD -> BRL ao vivo (UTMify trabalha em Reais)
async function usdToBrl(): Promise<number> {
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=BRL");
    const d = await r.json();
    return d && d.rates && d.rates.BRL ? d.rates.BRL : 5.5;
  } catch (_) { return 5.5; }
}

async function sendFacebook(order: any, items: any[]) {
  if (!FB_CAPI_TOKEN) return;
  const email = (order.email || "").trim().toLowerCase();
  const tp = order.tracking_params || {};
  const user_data: any = {};
  if (email) user_data.em = [await sha256(email)];
  if (tp.fbp) user_data.fbp = tp.fbp;                          // cookie do Pixel -> match exato
  if (tp.fbc) user_data.fbc = tp.fbc;
  else if (tp.fbclid) user_data.fbc = `fb.1.${Math.floor(Date.now() / 1000)}.${tp.fbclid}`;
  const body = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: order.id,                       // mesmo id do navegador -> deduplica
      action_source: "website",
      user_data,
      custom_data: {
        currency: (order.currency || "usd").toUpperCase(),
        value: order.total_cents / 100,
        content_type: "product",
        content_ids: items.map((it) => it.products && it.products.slug).filter(Boolean),
      },
    }],
  };
  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${FB_PIXEL_ID}/events?access_token=${FB_CAPI_TOKEN}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    console.log("FB CAPI", resp.status, (await resp.text()).slice(0, 300));
  } catch (e) { console.log("FB CAPI ERROR", String(e)); }
}

async function sendUtmify(order: any, items: any[], isTest: boolean) {
  if (!UTMIFY_API_TOKEN) return;
  const tp = order.tracking_params || {};
  const now = fmtUTC(new Date());
  const rate = await usdToBrl();                 // converte USD -> BRL (UTMify usa Reais)
  const toBrl = (cents: number) => Math.round(cents * rate);
  const body = {
    orderId: order.id,
    platform: "PaniniStore",
    paymentMethod: "credit_card",
    status: "paid",
    createdAt: order.created_at ? fmtUTC(new Date(order.created_at)) : now,
    approvedDate: now,
    refundedAt: null,
    customer: {
      name: order.shipping_name || (order.email ? order.email.split("@")[0] : "Cliente"),
      email: order.email || "sem-email@panini.store",
      phone: null, document: null, country: "US",
    },
    products: items.map((it) => ({
      id: (it.products && it.products.slug) || "item", name: it.name,
      planId: null, planName: null, quantity: it.quantity, priceInCents: toBrl(it.unit_price_cents),
    })),
    trackingParameters: {
      src: tp.src || null, sck: tp.sck || null,
      utm_source: tp.utm_source || null, utm_campaign: tp.utm_campaign || null,
      utm_medium: tp.utm_medium || null, utm_content: tp.utm_content || null, utm_term: tp.utm_term || null,
    },
    commission: { totalPriceInCents: toBrl(order.total_cents), gatewayFeeInCents: 0, userCommissionInCents: toBrl(order.total_cents) },
    isTest: isTest,
  };
  try {
    const resp = await fetch("https://api.utmify.com.br/api-credentials/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-token": UTMIFY_API_TOKEN,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      body: JSON.stringify(body),
    });
    console.log("UTMIFY", resp.status, "isTest=" + isTest, "USD->BRL=" + rate, (await resp.text()).slice(0, 400));
  } catch (e) { console.log("UTMIFY ERROR", String(e)); }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const raw = await req.text();
  const headers = Object.fromEntries(req.headers); // chaves em minúsculas
  if (!(await verify(raw, headers))) {
    console.log("WHOP webhook invalid signature");
    return new Response("invalid signature", { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  if (event.type === "payment.succeeded") {
    const pay = event.data || {};
    const orderId = pay.metadata && pay.metadata.order_id;
    if (orderId) {
      // 1) marca como paid
      await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
        method: "PATCH", headers: { ...sb, Prefer: "return=minimal" },
        body: JSON.stringify({ status: "paid", whop_payment_id: pay.id }),
      });
      // 2) busca pedido + itens
      const order = (await (await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=*`, { headers: sb })).json())[0];
      const items = await (await fetch(`${SUPABASE_URL}/rest/v1/order_items?order_id=eq.${orderId}&select=name,quantity,unit_price_cents,products(slug)`, { headers: sb })).json();
      console.log("WHOP webhook order", orderId, "found", !!order, "items", (items || []).length);
      // 3) dispara Facebook + UTMify
      if (order) await Promise.allSettled([sendFacebook(order, items), sendUtmify(order, items, false)]);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
