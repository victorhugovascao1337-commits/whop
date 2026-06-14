# -*- coding: utf-8 -*-
"""Pedido de teste completo: cria e CONFIRMA um PaymentIntent com o cartao de
teste do Stripe (pm_card_visa). Prova que a loja consegue aprovar um pagamento
de ponta a ponta. Modo teste -> nenhuma cobranca real."""
import io, os, json, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
KEYFILE = next((os.path.join(HERE, c) for c in ["_stripe_key.txt", "_stripe_key.txt.txt"]
                if os.path.exists(os.path.join(HERE, c))), None)
key = io.open(KEYFILE, "r", encoding="utf-8-sig").read().strip()


def api(path, fields):
    data = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request("https://api.stripe.com/v1/" + path, data=data)
    req.add_header("Authorization", "Bearer " + key)
    try:
        return json.loads(urllib.request.urlopen(req).read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())


# Carrinho do pedido: 2x $200.00 + 1x $175.00 = $575.00
CART = [("Carter Bryant Autographed Basketball (50% OFF)", 20000, 2),
        ("Angel Reese WNBA Basketball (50% OFF)", 17500, 1)]
total = sum(p * q for _, p, q in CART)

fields = [
    ("amount", str(total)),
    ("currency", "usd"),
    ("payment_method", "pm_card_visa"),     # cartao de teste 4242...
    ("confirm", "true"),
    ("payment_method_types[]", "card"),
    ("description", "Pedido de teste - Panini Store"),
    ("receipt_email", "ct.agenciawave@gmail.com"),
    ("metadata[origem]", "teste-loja"),
]
for i, (name, price, qty) in enumerate(CART):
    fields.append(("metadata[item_%d]" % i, "%dx %s ($%.2f)" % (qty, name, price / 100.0)))

print("Criando pedido de teste de $%.2f ...\n" % (total / 100.0))
pi = api("payment_intents", fields)

if "error" in pi:
    print("ERRO:", pi["error"].get("message"))
else:
    print("=============== RESULTADO DO PEDIDO ===============")
    print("  PaymentIntent: ", pi.get("id"))
    print("  STATUS:        ", pi.get("status").upper())
    print("  valor:          $%.2f %s" % (pi.get("amount", 0) / 100.0, pi.get("currency", "").upper()))
    ch = (pi.get("latest_charge"))
    print("  charge:        ", ch)
    print("  recibo p/:     ", pi.get("receipt_email"))
    print()
    if pi.get("status") == "succeeded":
        print("  >>> PAGAMENTO APROVADO COM SUCESSO. A loja consegue receber pedidos. <<<")
    else:
        print("  >>> status:", pi.get("status"), "- ver next_action")
