#!/usr/bin/env python3
"""Generate optimised images and brand icons into public/.

Run:  python3 tools/build_assets.py
Needs Pillow >= 11 (AVIF + WebP support).

Brand assets come from the official files in brand/source/ (2500px JPEGs
supplied by the owner). Nothing is redrawn: the script only removes the white
paper (ink separation), so every shape stays exactly as in the official file.
If an SVG master is supplied later, put it in brand/source/ and switch the
header/footer <img> to it; icons can still be generated from it here.
"""
from pathlib import Path
from PIL import Image
import numpy as np
import json

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
SRC_IMG = ROOT / "media" / "images"
SRC_VID = ROOT / "media" / "videos"


def save_pair(im, out_base, q_webp=72, q_avif=50):
    out_base.parent.mkdir(parents=True, exist_ok=True)
    im.save(out_base.with_suffix(".webp"), "WEBP", quality=q_webp, method=6)
    im.save(out_base.with_suffix(".avif"), "AVIF", quality=q_avif, speed=4)


def crop_ratio(im, rw, rh, y_bias=0.5):
    w, h = im.size
    target = rw / rh
    if w / h > target:
        nw = round(h * target)
        x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = round(w / target)
    y = round((h - nh) * y_bias)
    return im.crop((0, y, w, y + nh))


def strains():
    for name in ["shinma", "zk", "isaac-newton"]:
        # *-hq.webp: the same product photos at ~970px, cropped from the owner's menu screenshots (Nov 2026)
        src = SRC_IMG / f"{name}-hq.webp"
        im = Image.open(src if src.exists() else SRC_IMG / f"{name}.webp").convert("RGB")
        im = crop_ratio(im, 4, 3)
        for w in (320, 640):
            save_pair(im.resize((w, w * 3 // 4), Image.LANCZOS), PUB / "img" / f"{name}-{w}")


def illustrations():
    # Illustrative images cut from the owner's design mockups (AI-generated, Nov 2026).
    # The site always shows them with an "image" label, never as a record of real work.
    for name in ["illus-soil", "illus-check"]:
        im = Image.open(SRC_IMG / f"{name}.png").convert("RGB")
        for w in (240, 480):
            save_pair(im.resize((w, round(w * im.height / im.width)), Image.LANCZOS), PUB / "img" / f"{name}-{w}")


def posters():
    for name in ["hero-canopy", "lights", "daily-care", "handcraft", "harvest-color", "macro",
                 "bud-closeup", "color-leaves", "aisle-walk", "led-canopy", "green-canopy"]:
        im = Image.open(SRC_VID / f"{name}.webp").convert("RGB")
        c = crop_ratio(im, 3, 4, 0.45)
        for w in (240, 480):
            save_pair(c.resize((w, w * 4 // 3), Image.LANCZOS), PUB / "img" / f"{name}-{w}")
    # 16:9 posters for the background video bands
    for name in ["aisle-band", "leaves-band", "led-band"]:
        im = crop_ratio(Image.open(SRC_VID / f"{name}.webp").convert("RGB"), 16, 9)
        for w in (640, 960):
            save_pair(im.resize((w, w * 9 // 16), Image.LANCZOS), PUB / "img" / f"{name}-{w}", q_webp=64, q_avif=42)
    # hero background (portrait source, kept portrait; CSS covers)
    im = Image.open(SRC_VID / "hero-canopy.webp").convert("RGB")
    save_pair(im.resize((540, 960), Image.LANCZOS), PUB / "img" / "hero-540", q_webp=60, q_avif=40)


def unmix(path, inks):
    """Separate flat inks from a white background (no redrawing).

    Each pixel is modelled as white minus a mix of the given ink colours
    (C = W - sum(a_i * (W - ink_i))). Solving for a_i keeps every brush edge
    exactly as in the official file; only the white paper is removed.
    Returns (alphas[h,w,n]).
    """
    img = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    W = 255.0
    d = (W - img).reshape(-1, 3)                       # darkness
    A = np.stack([W - np.array(c, np.float32) for c in inks], axis=1)  # 3 x n
    sol, *_ = np.linalg.lstsq(A, d.T, rcond=None)       # n x N
    sol = np.clip(sol.T, 0, 1)
    tot = sol.sum(axis=1, keepdims=True)
    sol = np.where(tot > 1, sol / np.maximum(tot, 1e-6), sol)
    sol[sol.sum(axis=1) < 0.02] = 0                      # paper noise
    return sol.reshape(img.shape[0], img.shape[1], len(inks))


def compose(alphas, colors):
    a = alphas.sum(axis=2)
    rgb = np.zeros(alphas.shape[:2] + (3,), np.float32)
    for i, c in enumerate(colors):
        rgb += alphas[..., i:i + 1] * np.array(c, np.float32)
    rgb = rgb / np.maximum(a[..., None], 1e-6)
    out = np.dstack([rgb, a * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def trim(im, pad_ratio=0.02):
    bb = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    pad = round(max(im.size) * pad_ratio)
    return im.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(im.width, bb[2] + pad), min(im.height, bb[3] + pad)))


def brand():
    src = ROOT / "brand" / "source"
    out = PUB / "brand"
    out.mkdir(parents=True, exist_ok=True)
    # Official files supplied by the owner (2500x2500 JPEG on white).
    mark_src = np.asarray(Image.open(src / "logo-mark-official.jpg").convert("RGB")).astype(int)
    m = (mark_src[..., 0] > 150) & (mark_src[..., 1] < 40) & (mark_src[..., 2] < 80)
    RED = tuple(int(v) for v in np.median(mark_src[m], axis=0))
    BLACK = (0, 0, 0)
    LIGHT = (245, 243, 239)

    mark = trim(compose(unmix(src / "logo-mark-official.jpg", [RED]), [RED]))
    for h in (64, 128, 256, 512):
        w = round(mark.width * h / mark.height)
        r = mark.resize((w, h), Image.LANCZOS)
        r.save(out / f"mark-{h}.png", optimize=True)
        r.save(out / f"mark-{h}.webp", "WEBP", quality=90, method=6)
    mark.save(out / "mark-master.png", optimize=True)

    full_a = unmix(src / "logo-full-official.jpg", [RED, BLACK])
    full = trim(compose(full_a, [RED, BLACK]))           # original colours (for light backgrounds)
    rev = trim(compose(full_a, [RED, LIGHT]))            # ink reversed to warm white for dark backgrounds
    for name, im in (("logo-full", full), ("logo-full-reverse", rev)):
        im.save(out / f"{name}-master.png", optimize=True)
        for h in (240, 480):
            w = round(im.width * h / im.height)
            r = im.resize((w, h), Image.LANCZOS)
            r.save(out / f"{name}-{h}.webp", "WEBP", quality=88, method=6)
            r.save(out / f"{name}-{h}.png", optimize=True)

    def icon(size, scale, name, bg=(16, 16, 16, 255)):
        canvas = Image.new("RGBA", (size, size), bg)
        mh = round(size * scale)
        mw = round(mark.width * mh / mark.height)
        canvas.alpha_composite(mark.resize((mw, mh), Image.LANCZOS), ((size - mw) // 2, (size - mh) // 2))
        canvas.save(out / name, optimize=True)

    icon(32, .84, "favicon-32.png")
    icon(48, .84, "favicon-48.png")
    icon(180, .7, "apple-touch-icon.png")
    icon(192, .7, "icon-192.png")
    icon(512, .7, "icon-512.png")
    icon(512, .56, "icon-maskable-512.png")
    hexcol = "#%02X%02X%02X" % RED
    (out / "brand.json").write_text(json.dumps({
        "sources": ["brand/source/logo-mark-official.jpg", "brand/source/logo-full-official.jpg"],
        "method": "flat-ink separation from white background; shapes untouched",
        "red_sampled": hexcol,
        "mark_aspect": round(mark.width / mark.height, 4),
    }, indent=2))
    print("mark", mark.size, "full", full.size, "red", hexcol)


if __name__ == "__main__":
    strains()
    illustrations()
    posters()
    brand()
