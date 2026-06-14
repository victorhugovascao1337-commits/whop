# -*- coding: utf-8 -*-
"""Teste rapido da API do Stripe (modo teste).
Le a chave secreta de _stripe_key.txt (NUNCA hardcode a chave aqui).
Cria uma Checkout Session com um carrinho de exemplo (com quantidades)
e imprime a URL de checkout. Nenhuma cobranca real acontece em modo teste.
"""
import io, os, json, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
CANDIDATES = ["_stripe_key.txt", "_stripe_key.txt.txt"]
KEYFILE = next((os.path.join(HERE, c) for c in CANDIDATES if os.path.exists(os.path.join(HERE, c))), None)

if not KEYFILE:
    raise SystemExit("Crie o arquivo _stripe_key.txt com sua chave sk_test_... dentro.")

key = io.open(KEYFILE, "r", encoding="utf-8-sig").read().strip()
if not key:
    raise SystemExit("O arquivo %s esta VAZIO. Cole a chave sk_test_... dentro e salve." % os.path.basename(KEYFILE))
if not key.startswith("sk_test_"):
    raise SystemExit("A chave em _stripe_key.txt precisa comecar com sk_test_ (modo teste).")

# Carrinho de exemplo: 2x produto A + 1x produto B (precos em centavos)
fields = [
    ("mode", "payment"),
    ("success_url", "http://127.0.0.1:5600/index.html?paid=1"),
    ("cancel_url", "http://127.0.0.1:5600/index.html?canceled=1"),
    ("line_items[0][price_data][currency]", "usd"),
    ("line_items[0][price_data][product_data][name]", "Carter Bryant Autographed Basketball (50% OFF)"),
    ("line_items[0][price_data][unit_amount]", "20000"),   # $200.00
    ("line_items[0][quantity]", "2"),
    ("line_items[1][price_data][currency]", "usd"),
    ("line_items[1][price_data][product_data][name]", "Angel Reese WNBA Basketball (50% OFF)"),
    ("line_items[1][price_data][unit_amount]", "17500"),   # $175.00
    ("line_items[1][quantity]", "1"),
]

data = urllib.parse.urlencode(fields).encode()
req = urllib.request.Request("https://api.stripe.com/v1/checkout/sessions", data=data)
req.add_header("Authorization", "Bearer " + key)

try:
    resp = urllib.request.urlopen(req)
    d = json.loads(resp.read().decode())
    print("OK! Checkout Session criada com sucesso.")
    print("  id:        ", d.get("id"))
    print("  status:    ", d.get("status"))
    print("  total:      $%.2f %s" % (d.get("amount_total", 0) / 100.0, (d.get("currency") or "").upper()))
    print("  itens:      2x $200.00  +  1x $175.00")
    print()
    print("  >>> Abra esta URL no navegador para ver o checkout (modo teste):")
    print("  " + (d.get("url") or "(sem url)"))
except urllib.error.HTTPError as e:
    body = json.loads(e.read().decode())
    err = body.get("error", {})
    print("ERRO %s: %s" % (e.code, err.get("message")))
    if err.get("type") == "invalid_request_error" and "API key" in (err.get("message") or ""):
        print("  -> Verifique se a chave em _stripe_key.txt esta completa e correta.")
