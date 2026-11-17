#!/usr/bin/env python3
"""
Use YOUR motorcycle photo as the hero (photorealistic path).

  python3 scripts/compose-hero.py path/to/photo.jpg [--vanish 0.62,0.55] [--frames .frames]

What it does
  1. copies the photo to assets/motorcycle/source-photo.jpg
  2. renders a looping "riding" sequence from it: Motoverse grade (crushed blacks,
     emerald cast) plus neon-green long-exposure light trails that stream past
     the bike toward a vanishing point and a pulsing headlight bloom
  3. runs scripts/build-assets.py, which builds the banner, the 1080x1350 mobile
     crop, the clean background plate and the GIFs from the photo instead of the
     engine renders

Only use a photo you own or are licensed to publish: the README is public.
--vanish is the point the trails converge on, as fractions of width,height
(default 0.62,0.55, which suits a bike angled toward the right of the frame).
"""
import argparse, math, os, shutil, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("--vanish", default="0.62,0.55")
    ap.add_argument("--frames", default=os.path.join(ROOT, ".frames"))
    ap.add_argument("--n", type=int, default=36)
    a = ap.parse_args()
    dst = os.path.join(ROOT, "assets", "motorcycle", "source-photo.jpg")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    Image.open(a.photo).convert("RGB").save(dst, quality=92)

    im = Image.open(dst).convert("RGB")
    w, h = im.size
    ar = 2.5
    im = im.crop(((w - h * ar) / 2, 0, (w + h * ar) / 2, h)) if w / h > ar else im.crop((0, (h - w / ar) / 2, w, (h + w / ar) / 2))
    im = im.resize((880, 352), Image.LANCZOS)
    vx, vy = (float(v) for v in a.vanish.split(","))
    vx, vy = vx * 880, vy * 352
    rng = np.random.default_rng(3)
    trails = [(rng.uniform(0, 2 * math.pi), rng.uniform(.2, 1), rng.uniform(1, 3), rng.integers(0, 2)) for _ in range(26)]
    out = os.path.join(a.frames, "riding")
    shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    base = np.asarray(im, dtype=float)
    for f in range(a.n):
        t = f / a.n
        layer = Image.new("RGB", im.size, 0); d = ImageDraw.Draw(layer)
        for ang, spd, wdt, white in trails:
            # streak travels outward from the vanishing point; loops seamlessly with t
            p = (t * spd * 2 + ang) % 1.0
            r0, r1 = 40 + p * 900, 40 + p * 900 + 60 + p * 260
            if abs(math.sin(ang)) > .55: continue  # keep trails near road level / horizontal
            x0, y0 = vx + math.cos(ang) * r0, vy + math.sin(ang) * r0 * .35
            x1, y1 = vx + math.cos(ang) * r1, vy + math.sin(ang) * r1 * .35
            col = (200, 255, 210) if white else (57, 255, 20)
            d.line([(x0, y0), (x1, y1)], fill=tuple(int(c * min(1, p * 2)) for c in col), width=int(wdt))
        glow = np.asarray(layer.filter(ImageFilter.GaussianBlur(4)), dtype=float) * 1.3 + np.asarray(layer, dtype=float)
        frame = np.clip(base + glow, 0, 255).astype(np.uint8)
        Image.fromarray(frame).save(os.path.join(out, f"f{f:03d}.png"))
    print("photo riding frames:", a.n)
    subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build-assets.py"), a.frames], check=True)


if __name__ == "__main__":
    main()
