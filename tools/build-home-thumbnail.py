#!/usr/bin/env python3
"""Build responsive Slop card JPEGs; then run build-webp.mjs for WebP siblings."""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
with Image.open(ROOT / "assets/slop/001.jpg") as original:
    image = ImageOps.exif_transpose(original).convert("RGB")
    for width in (480, 720, 960):
        # Match the card's existing centered 3:2 crop without downloading hidden pixels.
        height = width * 2 // 3
        thumbnail = ImageOps.fit(image, (width, height), Image.Resampling.LANCZOS)
        destination = ROOT / f"assets/thumbs/slop-{width}.jpg"
        thumbnail.save(destination, quality=90, optimize=True, progressive=True)
        print(f"{destination.relative_to(ROOT)}: {width} x {height}")
