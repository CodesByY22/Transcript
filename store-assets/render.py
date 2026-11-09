"""Render store HTML mockups to exact-size PNGs via Playwright."""
from __future__ import annotations

from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

SRC = Path(__file__).resolve().parent / "src"
OUT = Path(__file__).resolve().parent

JOBS = [
    ("screenshot-1.html", "screenshot-1.png", 1280, 800, (11, 20, 34)),
    ("screenshot-2.html", "screenshot-2.png", 1280, 800, (11, 20, 34)),
    ("screenshot-3.html", "screenshot-3.png", 1280, 800, (11, 20, 34)),
    ("screenshot-4.html", "screenshot-4.png", 1280, 800, (11, 20, 34)),
    ("screenshot-5.html", "screenshot-5.png", 1280, 800, (11, 20, 34)),
    ("promo-small.html", "promo-small-440x280.png", 440, 280, (14, 26, 43)),
    ("promo-marquee.html", "promo-marquee-1400x560.png", 1400, 560, (14, 26, 43)),
]


def flatten_rgb(path: Path, bg: tuple[int, int, int]):
    im = Image.open(path)
    if im.mode == "RGBA":
        base = Image.new("RGB", im.size, bg)
        base.paste(im, mask=im.split()[-1])
        im = base
    elif im.mode != "RGB":
        im = im.convert("RGB")
    im.save(path, "PNG")
    return im.size


def render():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for html_name, png_name, w, h, bg in JOBS:
            html = SRC / html_name
            dest = OUT / png_name
            page = browser.new_page(
                viewport={"width": w, "height": h},
                device_scale_factor=1,
            )
            page.emulate_media(color_scheme="light")
            page.goto(html.as_uri(), wait_until="networkidle")
            page.wait_for_timeout(120)
            page.screenshot(
                path=str(dest),
                clip={"x": 0, "y": 0, "width": w, "height": h},
                omit_background=False,
            )
            page.close()
            size = flatten_rgb(dest, bg)
            print(f"wrote {dest.name} {size}")
        browser.close()


if __name__ == "__main__":
    render()
