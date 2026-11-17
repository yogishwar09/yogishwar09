#!/usr/bin/env python3
"""
Optimise and validate the profile's assets.

  python3 scripts/optimize-assets.py           minify SVGs in place, then validate
  python3 scripts/optimize-assets.py --check   validate only (used by CI)

Validation fails (exit 1) when:
  * a local image/link referenced by README.md is missing
  * an SVG is not well-formed XML, lacks a <title>, or contains <script> / external refs
  * an asset exceeds its size budget
  * an <img> in README.md has no alt attribute
"""
import argparse, os, re, sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUDGET = {".gif": 3_000_000, ".png": 2_000_000, ".svg": 140_000, ".jpg": 2_000_000}
NS = "{http://www.w3.org/2000/svg}"


def minify(path):
    s = open(path, encoding="utf-8").read()
    m = re.sub(r">\s+<", "><", s)
    m = re.sub(r"[ \t]{2,}", " ", m)
    if len(m) < len(s):
        open(path, "w", encoding="utf-8").write(m)
    return len(s), len(m)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    errors, warn = [], []

    assets = [os.path.join(dp, f) for dp, _, fs in os.walk(os.path.join(ROOT, "assets")) for f in fs if not f.startswith(".")]
    if not a.check:
        saved = 0
        for p in assets:
            if p.endswith(".svg"):
                before, after = minify(p)
                saved += before - after
        print(f"minified SVGs, saved {saved / 1024:.1f} KB")

    for p in assets:
        rel = os.path.relpath(p, ROOT)
        ext = os.path.splitext(p)[1].lower()
        size = os.path.getsize(p)
        if ext in BUDGET and size > BUDGET[ext]:
            errors.append(f"{rel}: {size / 1024:.0f} KB exceeds budget {BUDGET[ext] / 1024:.0f} KB")
        if ext == ".svg":
            try:
                root = ET.parse(p).getroot()
            except ET.ParseError as e:
                errors.append(f"{rel}: invalid XML ({e})")
                continue
            if root.find(f"{NS}title") is None:
                errors.append(f"{rel}: missing <title> (accessibility)")
            text = open(p, encoding="utf-8").read()
            if "<script" in text:
                errors.append(f"{rel}: contains <script> (GitHub strips it)")
            if re.search(r'(href|src)="(https?:)?//', text):
                errors.append(f"{rel}: references an external resource (blocked inside <img>)")

    readme = open(os.path.join(ROOT, "README.md"), encoding="utf-8").read()
    for tag in re.findall(r"<img\b[^>]*>", readme):
        if "alt=" not in tag:
            errors.append(f"README: <img> without alt: {tag[:80]}")
    local = re.findall(r'(?:src|srcset|href)="((?!https?:|mailto:|#)[^"]+)"', readme)
    local += re.findall(r"\]\(((?!https?:|mailto:|#)[^)]+)\)", readme)
    for ref in sorted(set(local)):
        if not os.path.exists(os.path.join(ROOT, ref)):
            errors.append(f"README: missing local file {ref}")
    external = sorted(set(re.findall(r'src="(https?://[^"]+)"', readme)))
    game = open(os.path.join(ROOT, "game", "index.html"), encoding="utf-8").read()
    for ref in re.findall(r'(?:src|href)="((?!https?:|#|mailto:)[^"]+)"', game):
        if not os.path.exists(os.path.join(ROOT, "game", ref)):
            errors.append(f"game/index.html: missing {ref}")
    if re.search(r'<script[^>]+src="https?:', game):
        errors.append("game/index.html loads a remote script (the game must run offline)")

    print(f"checked {len(assets)} assets, {len(set(local))} local refs, {len(external)} external image URLs")
    for e in errors:
        print("ERROR", e)
    if errors:
        sys.exit(1)
    print("all checks passed")


if __name__ == "__main__":
    main()
