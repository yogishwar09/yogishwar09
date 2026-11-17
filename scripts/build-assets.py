#!/usr/bin/env python3
"""
Turn raw Motoverse renders (scripts/capture.mjs) — or your own photo
(scripts/compose-hero.py) — into the finished README assets.

  python3 scripts/build-assets.py [frames_dir]

Writes:
  assets/motorcycle/rider-background.png   1920x1080 clean plate (no text)
  assets/motorcycle/hero-banner.png         1600x640 banner with typography
  assets/motorcycle/hero-mobile.png         1080x1350 portrait crop with typography
  assets/motorcycle/riding-animation.gif    looping riding shot with moving green trails
  assets/game/game-preview.gif              gameplay with HUD (autopilot demo run)
  assets/contributions/contribution-terrain.png
"""
import os, shutil, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".frames")
A = os.path.join(ROOT, "assets")
GREEN, ELECTRIC, WHITE, MUTED = (0, 230, 118), (57, 255, 20), (242, 255, 244), (143, 162, 149)
FONT_DIRS = ["/usr/share/fonts/opentype/inter", "/usr/share/fonts/truetype/dejavu", "/Library/Fonts", "C:/Windows/Fonts"]


def font(names, size):
    for d in FONT_DIRS:
        for n in names:
            if os.path.exists(os.path.join(d, n)):
                return ImageFont.truetype(os.path.join(d, n), size)
    return ImageFont.load_default()


BLACK = lambda s: font(["InterDisplay-Black.otf", "Inter-Black.otf", "DejaVuSans-Bold.ttf", "arialbd.ttf"], s)
BOLD = lambda s: font(["InterDisplay-Bold.otf", "Inter-Bold.otf", "DejaVuSans-Bold.ttf", "arialbd.ttf"], s)
MONO = lambda s: font(["JetBrainsMono-Medium.ttf", "DejaVuSansMono.ttf", "consola.ttf"], s)


def tracked(d, xy, text, f, fill, tr):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=f, fill=fill)
        x += f.getlength(ch) + tr
    return x


def width(text, f, tr):
    return sum(f.getlength(c) for c in text) + tr * (len(text) - 1)


def chrome_name(text, size, tr):
    """YOGISHWAR in polished dark chrome with a racing-green seam."""
    f = BLACK(size)
    w, h = int(width(text, f, tr)) + 10, int(size * 1.25)
    m = Image.new("L", (w, h), 0)
    tracked(ImageDraw.Draw(m), (0, 0), text, f, 255, tr)
    m = m.crop(m.getbbox())
    w, h = m.size
    y = np.linspace(0, 1, h)[:, None]
    g = np.clip(.98 - .5 * y / .5, 0, 1) * (y < .5) + (y >= .5) * (.1 + .75 * (y - .5) / .5)
    rgb = np.repeat(np.stack([g, g * 1.02, g], -1), w, 1)
    seam = np.exp(-((y - .53) / .035) ** 2)[..., None]
    rgb = rgb * (1 - seam) + np.array([0, .9, .46]) * seam * 1.15
    return Image.fromarray(np.clip(rgb * 255, 0, 255).astype(np.uint8)), m


def grade(im):
    """Push any plate toward the black + neon-green Motoverse look."""
    a = np.asarray(im.convert("RGB"), dtype=float) / 255
    lum = a @ np.array([.2126, .7152, .0722])
    crushed = np.clip((a - .02) / .98, 0, 1) ** 1.18
    tint = np.stack([lum * .55, lum * 1.0, lum * .7], -1)
    out = crushed * .78 + tint * .22
    return Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8))


def scrim(im, side="left", strength=.88):
    w, h = im.size
    x = np.linspace(0, 1, w)[None, :]
    yv = np.linspace(0, 1, h)[:, None]
    if side == "left":
        a = np.clip(1 - x / .58, 0, 1) ** 1.4 * strength
    else:  # top
        a = np.clip(1 - yv / .42, 0, 1) ** 1.3 * strength + np.zeros((1, w))
    a = np.maximum(a, np.clip((yv - .8) / .2, 0, 1) * .6)
    arr = np.asarray(im, dtype=float) * (1 - a[..., None]) + np.array([2, 4, 3]) * a[..., None]
    return Image.fromarray(arr.astype(np.uint8))


def banner(plate, out):
    im = scrim(grade(plate).resize((1600, 640), Image.LANCZOS), "left")
    d = ImageDraw.Draw(im)
    x0 = 84
    d.rectangle([x0, 150, x0 + 26, 156], fill=GREEN)
    tracked(d, (x0 + 40, 143), "GITHUB · YOGISHWAR09 · NIGHT SESSION", MONO(15), MUTED, 3)
    tex, m = chrome_name("YOGISHWAR", 128, 4)
    sh = Image.new("L", im.size, 0); sh.paste(m, (x0 + 4, 194)); sh = sh.filter(ImageFilter.GaussianBlur(12))
    im.paste((0, 0, 0), (0, 0), sh.point(lambda v: int(v * .8)))
    im.paste(tex, (x0, 186), m)
    y = 186 + m.size[1] + 34
    xe = tracked(d, (x0, y), "CODE. RIDE. ", BOLD(36), WHITE, 9)
    gl = Image.new("RGBA", im.size, (0, 0, 0, 0)); gd = ImageDraw.Draw(gl)
    tracked(gd, (xe, y), "CREATE.", BOLD(36), ELECTRIC + (255,), 9)
    im.paste(gl.filter(ImageFilter.GaussianBlur(10)), (0, 0), gl.filter(ImageFilter.GaussianBlur(10)))
    tracked(d, (xe, y), "CREATE.", BOLD(36), ELECTRIC, 9)
    tracked(d, (x0, y + 64), "ENGINEERING THE FUTURE.", MONO(17), WHITE, 6)
    xx = tracked(d, (x0, y + 98), "COMPUTER SCIENCE", MONO(15), MUTED, 3)
    for part in ("DATA SCIENCE", "AI & ML"):
        d.rectangle([xx + 14, y + 104, xx + 22, y + 112], fill=GREEN); xx = tracked(d, (xx + 36, y + 98), part, MONO(15), MUTED, 3)
    d.rectangle([0, 636, 1600, 640], fill=GREEN)
    im.save(out, optimize=True)


def mobile(plate, out):
    im = scrim(grade(plate).resize((1080, 1350), Image.LANCZOS), "top", .92)
    d = ImageDraw.Draw(im)
    tex, m = chrome_name("YOGISHWAR", 150, 4)
    x = (1080 - m.size[0]) // 2
    im.paste(tex, (x, 120), m)
    y = 120 + m.size[1] + 40
    t = "CODE. RIDE. CREATE."
    xs = (1080 - width(t, BOLD(44), 10)) / 2
    xe = tracked(d, (xs, y), "CODE. RIDE. ", BOLD(44), WHITE, 10)
    tracked(d, (xe, y), "CREATE.", BOLD(44), ELECTRIC, 10)
    t2 = "ENGINEERING THE FUTURE."
    tracked(d, ((1080 - width(t2, MONO(22), 7)) / 2, y + 74), t2, MONO(22), WHITE, 7)
    t3 = "CS | DATA SCIENCE | AI & ML"
    tracked(d, ((1080 - width(t3, MONO(20), 4)) / 2, y + 116), t3, MONO(20), MUTED, 4)
    d.rectangle([0, 1342, 1080, 1350], fill=GREEN)
    im.save(out, optimize=True)


def gif(frames_dir, out, width_px, fps=15, colors=96, overlay=None, crop=None, every=1, dither="bayer:bayer_scale=4"):
    tmp = tempfile.mkdtemp()
    files = sorted(f for f in os.listdir(frames_dir) if f.endswith(".png"))[::every]
    for i, f in enumerate(files):
        im = Image.open(os.path.join(frames_dir, f)).convert("RGB")
        if crop: im = im.crop(crop)
        im = grade(im) if overlay != "hud" else im
        if overlay == "brand":
            im = scrim(im, "left", .8)
            dd = ImageDraw.Draw(im); k = im.size[0] / 880
            tex, m = chrome_name("YOGISHWAR", int(64 * k), 2)
            im.paste(tex, (int(40 * k), int(118 * k)), m)
            tracked(dd, (int(42 * k), int(118 * k) + m.size[1] + int(16 * k)), "CODE. RIDE. CREATE.", BOLD(int(18 * k)), WHITE, int(5 * k))
        im.resize((width_px, int(im.size[1] * width_px / im.size[0])), Image.LANCZOS).save(os.path.join(tmp, f"f{i:03d}.png"))
    fr = f"-framerate {fps} -i {tmp}/f%03d.png"
    subprocess.run(f"ffmpeg -y -loglevel error {fr} -vf palettegen=max_colors={colors}:stats_mode=full {tmp}/p.png", shell=True, check=True)
    subprocess.run(f"ffmpeg -y -loglevel error {fr} -i {tmp}/p.png -lavfi paletteuse=dither={dither}:diff_mode=rectangle -loop 0 {out}", shell=True, check=True)
    shutil.rmtree(tmp)
    print(f"  {os.path.relpath(out, ROOT)}  {os.path.getsize(out) // 1024} KB")


def main():
    for d in ("motorcycle", "game", "contributions"):
        os.makedirs(os.path.join(A, d), exist_ok=True)
    photo = os.path.join(A, "motorcycle", "source-photo.jpg")
    use_photo = os.path.exists(photo)
    wide = Image.open(photo) if use_photo else Image.open(os.path.join(FR, "rider-background.png"))
    plate = Image.open(photo) if use_photo else Image.open(os.path.join(FR, "hero-plate.png"))
    mob = Image.open(photo) if use_photo else Image.open(os.path.join(FR, "mobile-plate.png"))
    if use_photo:  # centre-crop the photo to each aspect
        def fit(im, ar):
            w, h = im.size
            return im.crop(((w - h * ar) / 2, 0, (w + h * ar) / 2, h)) if w / h > ar else im.crop((0, (h - w / ar) / 2, w, (h + w / ar) / 2))
        wide, plate, mob = fit(wide, 16 / 9), fit(plate, 2.5), fit(mob, .8)
    grade(wide.resize((1920, 1080), Image.LANCZOS)).save(os.path.join(A, "motorcycle", "rider-background.png"), optimize=True)
    banner(plate, os.path.join(A, "motorcycle", "hero-banner.png"))
    mobile(mob, os.path.join(A, "motorcycle", "hero-mobile.png"))
    grade(Image.open(os.path.join(FR, "terrain.png"))).save(os.path.join(A, "contributions", "contribution-terrain.png"), optimize=True)
    if os.path.isdir(os.path.join(FR, "riding")):
        gif(os.path.join(FR, "riding"), os.path.join(A, "motorcycle", "riding-animation.gif"), 800, fps=15, colors=80, overlay="brand")
    if os.path.isdir(os.path.join(FR, "gameplay")):
        gif(os.path.join(FR, "gameplay"), os.path.join(A, "game", "game-preview.gif"), 640, fps=10, colors=64, overlay="hud", every=2, dither="none")
    print("assets built from", "your photo" if use_photo else "engine renders")


if __name__ == "__main__":
    main()
