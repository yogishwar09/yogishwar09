#!/usr/bin/env python3
"""
Render README.md into preview.html — an approximation of GitHub's profile page
(dark theme, 1012px column) so the profile can be reviewed before publishing.

  python3 scripts/build-preview.py            -> preview.html (open in any browser)
  python3 scripts/build-preview.py --light    -> preview-light.html (GitHub light theme)

External cards (shields.io, skillicons.dev, visitor counter, stats services)
load only when you are online, exactly as on GitHub.
"""
import argparse, os, re
import markdown

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CSS = {
    "dark": dict(bg="#0d1117", fg="#e6edf3", border="#30363d", muted="#7d8590", link="#4493f8", panel="#161b22"),
    "light": dict(bg="#ffffff", fg="#1f2328", border="#d0d7de", muted="#59636e", link="#0969da", panel="#f6f8fa"),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--light", action="store_true")
    a = ap.parse_args()
    theme = CSS["light" if a.light else "dark"]
    src = open(os.path.join(ROOT, "README.md"), encoding="utf-8").read()
    src = re.sub(r"<!--.*?-->", "", src, flags=re.S)
    src = src.replace("<td ", '<td markdown="1" ')  # GitHub renders markdown inside table cells
    body = markdown.markdown(src, extensions=["md_in_html", "tables", "fenced_code"])
    html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview · yogishwar09 / README.md (Motoverse)</title>
<style>
  body{{margin:0;background:{theme['bg']};color:{theme['fg']};font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif}}
  .bar{{border-bottom:1px solid {theme['border']};padding:14px 24px;font-size:14px;color:{theme['muted']}}}
  .bar b{{color:{theme['fg']}}}
  .wrap{{max-width:1012px;margin:24px auto;padding:0 16px}}
  .box{{border:1px solid {theme['border']};border-radius:6px}}
  .box .head{{padding:8px 16px;border-bottom:1px solid {theme['border']};font-size:12px;color:{theme['muted']};font-family:ui-monospace,SFMono-Regular,Menlo,monospace}}
  article{{padding:32px}}
  article img{{max-width:100%;box-sizing:content-box;border-style:none}}
  article p{{margin:0 0 16px}}
  a{{color:{theme['link']};text-decoration:none}}
  table{{border-collapse:collapse;width:max-content;max-width:100%;display:block;overflow:auto;margin:0 0 16px}}
  td{{border:1px solid {theme['border']};padding:6px 13px}}
  code{{background:{theme['panel']};padding:.2em .4em;border-radius:6px;font-size:85%}}
  details{{margin:0 0 16px}} summary{{cursor:pointer}}
  sub{{font-size:75%}}
  @media (max-width:600px){{article{{padding:16px}}}}
</style></head>
<body><div class="bar"><b>yogishwar09</b> / README.md · local preview ({'light' if a.light else 'dark'} theme)</div>
<div class="wrap"><div class="box"><div class="head">yogishwar09 / README.md</div><article>
{body}
</article></div></div></body></html>"""
    out = os.path.join(ROOT, "preview-light.html" if a.light else "preview.html")
    open(out, "w", encoding="utf-8").write(html)
    print("wrote", os.path.relpath(out, ROOT))


if __name__ == "__main__":
    main()
