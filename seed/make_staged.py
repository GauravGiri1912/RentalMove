"""
make_staged.py — how the 2025/2026 demo photos were made (transparency for judges/reviewers).

RentalMove's seed originally reused the SAME file for every year, so "compare" compared a
photo with itself. These staged captures start from each real 2024 photo, add known marks
(the "ground truth"), then simulate a real handheld re-capture: slight zoom and shift,
exposure/white-balance change, sensor noise and JPEG re-encoding. Because every step is
known, seed/ground-truth.json holds the exact box of every staged change in the new frame,
which scripts/eval-change-detection.ts uses to measure localisation accuracy.

Run:  python seed/make_staged.py      (needs Pillow + numpy)
"""

import json
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent
IMG = ROOT / "images"
W, H = 1200, 896
random.seed(11)
np.random.seed(11)


def composite(img, draw_fn, blur, strength, colour):
    layer = Image.new("L", img.size, 0)
    draw_fn(ImageDraw.Draw(layer))
    layer = layer.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * strength))
    return Image.composite(Image.new("RGB", img.size, colour), img, layer)


# ---- marks, in ORIGINAL (2024) pixel coordinates ---------------------------------------

def kitchen_scratches(d):
    rnd = random.Random(3)
    for _ in range(14):
        x = 632 + rnd.gauss(20, 14); y = 600 + rnd.gauss(30, 22); L = rnd.uniform(12, 48); a = rnd.uniform(-0.25, 0.15)
        d.line([(x, y), (x + L, y + L * a)], fill=rnd.randint(120, 255), width=1)

def kitchen_chip(d): d.ellipse([603, 785, 613, 792], fill=255)

def bath_grout(d, amount):
    rnd = random.Random(5)
    for _ in range(int(420 * amount)):
        t = rnd.random(); x = int(510 + t * 470); y = int(684 - t * 40 + rnd.gauss(0, 5)); r = rnd.choice([1, 1, 2, 2, 3])
        d.ellipse([x - r, y - r, x + r, y + r], fill=rnd.randint(150, 255))
    for _ in range(int(140 * amount)):
        y = rnd.randint(585, 690); x = int(578 + rnd.gauss(0, 4)); r = rnd.choice([1, 2, 2])
        d.ellipse([x - r, y - r, x + r, y + r], fill=220)

def bath_crack(d): d.line([(300, 770), (330, 781), (352, 779), (381, 796), (420, 808), (452, 806)], fill=255, width=2)

def bed_dent(d): d.ellipse([468, 413, 482, 426], fill=255)

def bed_scuffs(d):
    rnd = random.Random(7)
    for _ in range(6):
        x = 545 + rnd.randint(0, 50); y = 520 + rnd.randint(0, 25); d.line([(x, y), (x + rnd.randint(25, 60), y + rnd.randint(-4, 4))], fill=180, width=3)

def living_scratches(d):
    for i in range(5):
        x = 690 + i * 9; d.line([(x, 705 + i * 3), (x + 150, 752 + i * 2)], fill=150, width=2)

def living_mark(d): d.ellipse([936, 408, 962, 428], fill=210)


def capture(img, zoom, ox, oy, exposure, warmth, noise):
    """Simulated handheld re-capture: zoom about the frame, crop at (ox, oy), light change, noise."""
    zw, zh = round(W * zoom), round(H * zoom)
    out = img.resize((zw, zh), Image.LANCZOS).crop((ox, oy, ox + W, oy + H))
    out = ImageEnhance.Brightness(out).enhance(exposure)
    arr = np.asarray(out).astype(np.float32)
    arr[..., 0] *= 1 + warmth; arr[..., 2] *= 1 - warmth
    arr += np.random.normal(0, noise, arr.shape)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)), (zoom, ox, oy)


def to_frame(box_px, t):
    zoom, ox, oy = t
    x1, y1, x2, y2 = box_px
    f = lambda x, y: ((x * zoom - ox) / W, (y * zoom - oy) / H)
    a, b = f(x1, y1); c, d = f(x2, y2)
    return [round(max(0, a), 3), round(max(0, b), 3), round(min(1, c), 3), round(min(1, d), 3)]


def main():
    pairs = []
    base = {r: Image.open(IMG / "2024" / r / f).convert("RGB") for r, f in [
        ("kitchen", "cabinet-base-01.jpg"), ("bathroom", "shower-tile-01.jpg"),
        ("bedroom", "bedroom-wall-01.jpg"), ("living_room", "living-floor-01.jpg")]}

    specs = [
        # room, year, filename, [(draw, blur, strength, colour, box_px, label, category)], capture params
        ("kitchen", "2025", "cabinet-base-02.jpg", [], (1.03, 22, 14, 1.04, 0.02, 2.0)),
        ("kitchen", "2026", "cabinet-base-03.jpg", [
            (kitchen_scratches, 0.6, 0.55, (96, 86, 76), (606, 560, 732, 681), "cluster of fine scratches", "scratch"),
            (kitchen_chip, 0.8, 0.6, (120, 105, 90), (600, 782, 616, 795), "small chip", "dent")], (1.045, 40, 24, 0.97, -0.015, 2.2)),
        ("bathroom", "2025", "shower-tile-02.jpg", [
            (lambda d: bath_grout(d, 0.45), 1.0, 0.3, (58, 52, 46), (505, 585, 990, 700), "early grout discolouration", "stain")], (1.025, 16, 10, 0.98, 0.01, 2.0)),
        ("bathroom", "2026", "shower-tile-03.jpg", [
            (lambda d: bath_grout(d, 1.0), 1.0, 0.55, (58, 52, 46), (500, 580, 1000, 705), "grout discolouration spread", "stain"),
            (bath_crack, 0.8, 0.7, (58, 52, 46), (296, 766, 456, 812), "hairline floor-tile crack", "crack")], (1.04, 34, 26, 1.03, 0.02, 2.2)),
        ("bedroom", "2026", "bedroom-wall-03.jpg", [
            (bed_dent, 1.6, 0.5, (110, 100, 90), (464, 409, 486, 430), "small wall dent", "dent"),
            (bed_scuffs, 1.4, 0.45, (58, 52, 46), (543, 515, 657, 550), "scuff marks on lower wall", "mark")], (1.035, 30, 18, 0.96, 0.0, 2.4)),
        ("living_room", "2026", "living-floor-03.jpg", [
            (living_scratches, 1.2, 0.35, (58, 52, 46), (688, 703, 880, 764), "floor scratches", "scratch"),
            (living_mark, 1.2, 0.35, (58, 52, 46), (933, 405, 965, 431), "wall mark", "mark")], (1.03, 20, 20, 1.02, -0.01, 2.0)),
    ]

    for room, year, fname, marks, cap in specs:
        img = base[room]
        for draw, blur, strength, colour, *_ in marks:
            img = composite(img, draw, blur, strength, colour)
        zoom, ox, oy, exposure, warmth, noise = cap
        out, t = capture(img, zoom, ox, oy, exposure, warmth, noise)
        dest = IMG / year / room / fname
        dest.parent.mkdir(parents=True, exist_ok=True)
        out.save(dest, quality=87)
        prior = {"kitchen": "cabinet-base-01.jpg", "bathroom": "shower-tile-01.jpg", "bedroom": "bedroom-wall-01.jpg", "living_room": "living-floor-01.jpg"}[room]
        pairs.append({
            "room": room, "prior": f"2024/{room}/{prior}", "current": f"{year}/{room}/{fname}",
            "capture": {"zoom": zoom, "crop_offset_px": [ox, oy], "exposure": exposure, "warmth": warmth, "noise_sigma": noise},
            "changes": [{"label": m[5], "category": m[6], "bbox": to_frame(m[4], t)} for m in marks],
        })
        print(dest.relative_to(ROOT), [p["bbox"] for p in pairs[-1]["changes"]])

    (ROOT / "ground-truth.json").write_text(json.dumps({
        "_comment": "Staged demo changes made by seed/make_staged.py. Boxes are exact, in each current photo's frame, normalised [x1,y1,x2,y2]. Real-world photos have no ground truth.",
        "pairs": pairs}, indent=2))


if __name__ == "__main__":
    main()
