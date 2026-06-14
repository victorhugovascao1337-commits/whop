# -*- coding: utf-8 -*-
import re, io

SRC = r"C:\Users\Vetz\Desktop\panini-offline\Panini America Online Store _ Shop Sports Trading Cards & Memorabilia!.html"
OUT = r"C:\Users\Vetz\Desktop\panini-offline\index.html"

with io.open(SRC, "r", encoding="utf-8", errors="replace") as f:
    html = f.read()

before = len(html)

# Remove browser-extension injected junk (Plasmo content-script UI)
html = re.sub(r"<plasmo-csui\b.*?</plasmo-csui>", "", html, flags=re.IGNORECASE | re.DOTALL)
# Remove all <script>...</script> blocks (external + inline)
html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.IGNORECASE | re.DOTALL)
# Remove self-closing / orphan script tags just in case
html = re.sub(r"<script\b[^>]*/?>", "", html, flags=re.IGNORECASE)
# Remove noscript blocks
html = re.sub(r"<noscript\b[^>]*>.*?</noscript>", "", html, flags=re.IGNORECASE | re.DOTALL)
# Remove iframes (recaptcha / cloudflare challenge / google translate leftovers that hang)
html = re.sub(r"<iframe\b[^>]*>.*?</iframe>", "", html, flags=re.IGNORECASE | re.DOTALL)
html = re.sub(r"<iframe\b[^>]*/?>", "", html, flags=re.IGNORECASE)
# Drop <link> tags pointing at third-party / dynamic endpoints (translate, recaptcha, cloudflare, gstatic)
html = re.sub(r'<link\b[^>]*href="[^"]*(translate|recaptcha|cloudflare|gstatic|cdn-cgi|saved_resource|anchor\.html|Api\.html)[^"]*"[^>]*>', "", html, flags=re.IGNORECASE)
# Drop dns-prefetch / preconnect hints to external hosts (cause hanging connections offline)
html = re.sub(r'<link\b[^>]*rel="(dns-prefetch|preconnect)"[^>]*>', "", html, flags=re.IGNORECASE)
# Point favicon to the local copy instead of the live domain
html = html.replace('href="https://www.paniniamerica.net/fav-icon-1.png"', 'href="fav-icon-1.png"')
# Drop third-party widget CSS not used on the homepage (upshot games, onfido/recaptcha styles)
# — they @import Google Fonts / load gstatic images and hang the page offline.
html = re.sub(r'<link\b[^>]*href="[^"]*(upshot|styles__ltr)\.css"[^>]*>', "", html, flags=re.IGNORECASE)
# Hide the empty alert modal & initial loader so nothing odd shows
html = html.replace('id="informationAlert"', 'id="informationAlert" style="display:none"')
# Force an early UTF-8 charset declaration right after <head>
html = re.sub(r"(<head[^>]*>)", r'\1<meta charset="utf-8">', html, count=1, flags=re.IGNORECASE)

# Point the hero video to the locally-downloaded copy (CDN blocks offline/hotlink)
html = html.replace(
    "https://assets.paniniamerica.net/catalog/product/video/1781205835-20260603_PANINI_FIFA_KYLIAN_MBAPPE_MEMORABILIA_STICKER_SIGNING_WEBSITE_VIDEO_SINGLE_TILE_BBM_1760x768.mp4",
    "./Panini America Online Store _ Shop Sports Trading Cards &amp; Memorabilia!_files/hero_mbappe.mp4",
)

with io.open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print("scripts removed. before=%d after=%d -> %s" % (before, len(html), OUT))
