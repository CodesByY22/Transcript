"""Generate TranscriptKit toolbar / store icons as crisp PNGs."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

INK = (14, 26, 43, 255)  # #0E1A2B
BLUE = (31, 79, 224, 255)  # #1F4FE0
WHITE = (255, 255, 255, 255)

ROOT = Path(__file__).resolve().parent.parent
STORE = Path(__file__).resolve().parent
SCALE = 8


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_mark(inner: int, simplify: bool = False) -> Image.Image:
    """Draw the rounded-square transcript mark filling `inner` px."""
    s = inner * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    radius = int(s * 0.24)
    rounded_rect(d, (0, 0, s - 1, s - 1), radius, INK)

    # Three pill bars, optically centered.
    inset_x = int(s * 0.20)
    bar_h = max(int(s * (0.11 if not simplify else 0.13)), SCALE * 2)
    gap = int(s * (0.11 if not simplify else 0.12))
    group_h = bar_h * 3 + gap * 2
    y0 = (s - group_h) // 2
    widths = [0.58, 0.40, 0.50] if not simplify else [0.62, 0.42, 0.52]
    colors = [BLUE, WHITE, WHITE]

    for i, (w, color) in enumerate(zip(widths, colors)):
        bw = int(s * w)
        x0 = inset_x
        y = y0 + i * (bar_h + gap)
        d.rounded_rectangle(
            [x0, y, x0 + bw, y + bar_h],
            radius=bar_h // 2,
            fill=color,
        )

    return img.resize((inner, inner), Image.Resampling.LANCZOS)


def make_icon(size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if size >= 128:
        pad = 16
        inner = size - pad * 2
        mark = draw_mark(inner, simplify=False)
        canvas.paste(mark, (pad, pad), mark)
    else:
        pad = 0 if size <= 16 else 2
        inner = size - pad * 2
        mark = draw_mark(inner, simplify=True)
        canvas.paste(mark, (pad, pad), mark)
    return canvas


def save_png(img: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")


def generate():
    sizes = (16, 48, 128)
    icons_dir = ROOT / "icons"
    for size in sizes:
        img = make_icon(size)
        dest = icons_dir / f"{size}.png"
        save_png(img, dest)
        print(f"wrote {dest} {img.size}")

    store_128 = STORE / "store-icon-128.png"
    save_png(make_icon(128), store_128)
    print(f"wrote {store_128}")


if __name__ == "__main__":
    generate()
