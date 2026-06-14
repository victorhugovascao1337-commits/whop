# -*- coding: utf-8 -*-
"""Make the header/footer link-buttons non-navigating (offline mirror) while
keeping their hover animation. External anchors keep their href (so :hover CSS
still applies) but get onclick="return false;" so a click does nothing."""
import io, re

FILES = ["fifa-world-cup-2026.html", "index.html"]


def disable(region):
    def repl(m):
        tag = m.group(0)
        if "onclick" in tag.lower():
            return tag
        href = re.search(r'href="([^"]*)"', tag)
        if not href:
            return tag
        h = href.group(1)
        if re.match(r'(?:https?:)?//', h):                 # external / live-site link
            return tag[:-1] + ' onclick="return false;" style="cursor:default">' \
                if "style=" not in tag.lower() else tag[:-1] + ' onclick="return false;">'
        return tag
    return re.sub(r'<a\b[^>]*>', repl, region)


def fix_logo(html):
    """The Panini brand logo (navbar-brand) lost its JS click handler. Point it
    at the site root and keep it clickable (never disabled)."""
    def repl(m):
        tag = m.group(0)
        tag = tag.replace(' onclick="return false;"', '').replace(' style="cursor:default"', '')
        if 'href=' in tag:
            tag = re.sub(r'href="[^"]*"', 'href="/"', tag)
        else:
            tag = tag[:-1] + ' href="/">'
        return tag
    return re.sub(r'<a\b[^>]*\bnavbar-brand\b[^>]*>', repl, html)


def patch(html):
    out = html
    for op, cl in (("<header", "</header>"), ("<footer", "</footer>")):
        s = out.find(op)
        e = out.find(cl)
        if s < 0 or e < 0:
            continue
        e += len(cl)
        out = out[:s] + disable(out[s:e]) + out[e:]
    out = fix_logo(out)
    return out


for f in FILES:
    p = r"C:\Users\Vetz\Desktop\panini-offline\%s" % f
    html = io.open(p, "r", encoding="utf-8", errors="replace").read()
    before = html.count('onclick="return false;"')
    html = patch(html)
    after = html.count('onclick="return false;"')
    io.open(p, "w", encoding="utf-8").write(html)
    print("%s: disabled %d header/footer links" % (f, after - before))
