"""Verify Chrome Web Store asset dimensions, format, and alpha."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
STORE = Path(__file__).resolve().parent

# (path, width, height, allow_alpha)
SPECS = [
    (ROOT / "icons" / "16.png", 16, 16, True),
    (ROOT / "icons" / "48.png", 48, 48, True),
    (ROOT / "icons" / "128.png", 128, 128, True),
    (STORE / "store-icon-128.png", 128, 128, True),
    (STORE / "screenshot-1.png", 1280, 800, False),
    (STORE / "screenshot-2.png", 1280, 800, False),
    (STORE / "screenshot-3.png", 1280, 800, False),
    (STORE / "screenshot-4.png", 1280, 800, False),
    (STORE / "screenshot-5.png", 1280, 800, False),
    (STORE / "promo-small-440x280.png", 440, 280, False),
    (STORE / "promo-marquee-1400x560.png", 1400, 560, False),
]


def has_alpha(im: Image.Image) -> bool:
    if im.mode in ("RGBA", "LA", "PA"):
        extrema = im.getchannel("A").getextrema()
        return extrema[0] < 255
    if "transparency" in im.info:
        return True
    return False


def verify() -> bool:
    rows = []
    ok_all = True
    print(f"{'FILE':<42} {'SIZE':<13} {'MODE':<6} {'ALPHA':<8} RESULT")
    print("-" * 86)
    for path, w, h, allow_alpha in SPECS:
        rel = path.relative_to(ROOT)
        if not path.exists():
            print(f"{str(rel):<42} {'missing':<13} {'':<6} {'':<8} FAIL")
            ok_all = False
            rows.append((path, None, False))
            continue
        im = Image.open(path)
        size_ok = im.size == (w, h)
        fmt_ok = (im.format or "").upper() == "PNG"
        alpha = has_alpha(im)
        alpha_ok = allow_alpha or not alpha
        passed = size_ok and fmt_ok and alpha_ok
        ok_all = ok_all and passed
        print(
            f"{str(rel):<42} {im.size[0]}x{im.size[1]:<8} {im.mode:<6} "
            f"{'yes' if alpha else 'no':<8} {'PASS' if passed else 'FAIL'}"
        )
        if not size_ok:
            print(f"  expected {w}x{h}")
        if not fmt_ok:
            print(f"  expected PNG, got {im.format}")
        if not alpha_ok:
            print("  expected no alpha channel")
        rows.append((path, im, passed))
    print("-" * 86)
    print("ALL PASS" if ok_all else "SOME FAILED")
    return ok_all


def contact_sheet():
    """Build a labeled preview of every store asset."""
    bg = (242, 245, 247)
    ink = (14, 26, 43)
    muted = (91, 107, 128)

    shots = [STORE / f"screenshot-{i}.png" for i in range(1, 6)]
    tiles = [
        STORE / "promo-small-440x280.png",
        STORE / "promo-marquee-1400x560.png",
    ]
    icons = [
        ROOT / "icons" / "16.png",
        ROOT / "icons" / "48.png",
        ROOT / "icons" / "128.png",
    ]

    W = 1600
    pad = 28
    y = pad
    canvas_h = 1680
    sheet = Image.new("RGB", (W, canvas_h), bg)
    draw = ImageDraw.Draw(sheet)
    try:
        font_lg = ImageFont.truetype("segoeui.ttf", 22)
        font_sm = ImageFont.truetype("segoeui.ttf", 14)
        font_tiny = ImageFont.truetype("segoeui.ttf", 12)
    except OSError:
        font_lg = font_sm = font_tiny = ImageFont.load_default()

    def label(text, x, yy, font=font_sm, fill=ink):
        draw.text((x, yy), text, font=font, fill=fill)

    label("TranscriptKit — Chrome Web Store assets", pad, y, font_lg)
    y += 40

    label("Icons (16 / 48 / 128)  +  16px at actual toolbar size", pad, y)
    y += 26

    x = pad
    # actual-size 16 on fake toolbar
    bar = Image.new("RGB", (220, 28), (32, 36, 42))
    ic16 = Image.open(icons[0]).convert("RGBA")
    bar.paste(ic16, (8, 6), ic16)
    dbar = ImageDraw.Draw(bar)
    dbar.text((30, 6), "TranscriptKit", font=font_tiny, fill=(220, 224, 230))
    sheet.paste(bar, (x, y + 40))
    label("16px actual", x, y, font_tiny, muted)
    x += 240

    for p, caption in zip(icons, ["16 (8x)", "48 (3x)", "128"]):
        im = Image.open(p).convert("RGBA")
        if im.size[0] == 16:
            show = im.resize((128, 128), Image.Resampling.NEAREST)
        elif im.size[0] == 48:
            show = im.resize((144, 144), Image.Resampling.NEAREST)
        else:
            show = im
        checker = Image.new("RGB", show.size, (255, 255, 255))
        checker.paste(show, mask=show.split()[-1] if show.mode == "RGBA" else None)
        sheet.paste(checker, (x, y))
        label(caption, x, y + show.size[1] + 4, font_tiny, muted)
        x += show.size[0] + 24

    y += 170
    label("Screenshots 1280×800", pad, y)
    y += 26
    thumb_w = 292
    gap = 12
    for i, p in enumerate(shots):
        im = Image.open(p).convert("RGB")
        th = im.resize((thumb_w, int(800 * thumb_w / 1280)), Image.Resampling.LANCZOS)
        col = i % 5
        xx = pad + col * (thumb_w + gap)
        sheet.paste(th, (xx, y))
        label(p.name, xx, y + th.size[1] + 4, font_tiny, muted)
    y += int(800 * thumb_w / 1280) + 36

    label("Promo tiles", pad, y)
    y += 26
    small = Image.open(tiles[0]).convert("RGB")
    marquee = Image.open(tiles[1]).convert("RGB")
    small_s = small.resize((440, 280), Image.Resampling.LANCZOS)
    mq_w = W - pad * 2 - 440 - 24
    mq_h = int(560 * mq_w / 1400)
    mq_s = marquee.resize((mq_w, mq_h), Image.Resampling.LANCZOS)
    sheet.paste(small_s, (pad, y))
    label("promo-small-440x280.png", pad, y + 280 + 4, font_tiny, muted)
    sheet.paste(mq_s, (pad + 440 + 24, y))
    label("promo-marquee-1400x560.png", pad + 440 + 24, y + mq_h + 4, font_tiny, muted)

    out = STORE / "preview.png"
    sheet.save(out, "PNG")
    print(f"wrote {out} {sheet.size}")


if __name__ == "__main__":
    verify()
    contact_sheet()
