// Supabase Edge Function: stripe-webhook
// Recebe os eventos do Stripe, valida a assinatura e marca o pedido como 'paid'.
// IMPORTANTE: deploy com "Verify JWT" DESLIGADO (o Stripe não manda JWT).
// Secrets: STRIPE_WEBHOOK_SECRET  (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são automáticos)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const enc = new TextEncoder();

async function verify(rawBody: string, sigHeader: string): Promise<boolean> {
  if (!sigHeader) return false;
  const parts: Record<string, string> = {};
  for (const kv of sigHeader.split(",")) {
    const i = kv.indexOf("=");
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const t = parts["t"], v1 = parts["v1"];
  if (!t || !v1) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // comparação simples (test mode)
  return hex === v1;
}

serve(async (req) => {
  const sig = req.headers.get("stripe-signature") || "";
  const raw = await req.text();

  if (!(await verify(raw, sig))) {
    return new Response("invalid signature", { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;
    const orderId = pi?.metadata?.order_id;
    if (orderId) {
      await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json", Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "paid",
          stripe_payment_intent: pi.id,
          email: pi.receipt_email || undefined,
        }),
      });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
