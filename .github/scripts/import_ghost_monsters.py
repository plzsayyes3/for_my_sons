#!/usr/bin/env python3
"""Download the credited OGA-BY 3.0 CraftPix pack and build game-sized PNGs."""
from __future__ import annotations
import colorsys
import io
import json
from pathlib import Path
from urllib.request import Request, urlopen
from zipfile import ZipFile
from PIL import Image, ImageOps

SOURCE_URL = "https://opengameart.org/sites/default/files/Monsters-PNG.zip"
SOURCE_PAGE = "https://opengameart.org/content/monster-2d-game-objects"
OUT_DIR = Path("ghost-typing/assets")
PACK_MAX_BYTES = 12 * 1024 * 1024

def download_pack() -> bytes:
    request = Request(
        SOURCE_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; ForMySons-asset-import/1.0)",
            "Referer": SOURCE_PAGE,
            "Accept": "application/zip,application/octet-stream,*/*",
        },
    )
    with urlopen(request, timeout=45) as response:
        data = response.read(PACK_MAX_BYTES + 1)
    if len(data) > PACK_MAX_BYTES or not data.startswith(b"PK"):
        raise RuntimeError("Archive is too large or not a ZIP file")
    return data

def load_images(zip_bytes: bytes):
    result = []
    with ZipFile(io.BytesIO(zip_bytes)) as archive:
        for entry in archive.infolist():
            if not entry.filename.lower().endswith(".png"):
                continue
            if entry.file_size > 5_000_000:
                continue
            raw = archive.read(entry)
            try:
                img = Image.open(io.BytesIO(raw))
                img.load()
                if img.width < 24 or img.height < 24 or img.width > 5000 or img.height > 5000:
                    continue
                img = img.convert("RGBA")
                if img.width > 400 or img.height > 400:
                    img.thumbnail((400, 400), Image.Resampling.LANCZOS)
                result.append((entry.filename, img))
            except Exception as exc:
                print(f"Skip {entry.filename}: {exc}")
    if len(result) < 3:
        raise RuntimeError(f"At least 3 PNG monsters expected; found {len(result)}")
    return result

def weights(img):
    small = img.copy()
    small.thumbnail((64, 64))
    bins = [0.0, 0.0, 0.0]
    colored = 0.0
    for r, g, b, a in small.getdata():
        if a < 140:
            continue
        h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
        if s < 0.36 or v < 0.20:
            continue
        colored += 1
        if 0.18 <= h <= 0.49:
            bins[0] += s
        if 0.49 < h <= 0.74:
            bins[1] += s
        if 0.01 <= h <= 0.17:
            bins[2] += s
    if colored == 0:
        return (0, 0, 0)
    return tuple(x / colored for x in bins)

def choose(images):
    categories = ["weak", "medium", "strong"]
    scored = [(name, img, weights(img)) for name, img in images]
    used = set()
    selected = []
    for category_index, category in enumerate(categories):
        best = max(
            (item for item in scored if item[0] not in used),
            key=lambda entry: (
                entry[2][category_index],
                sum(entry[2]),
                min(entry[1].size),
                entry[0],
            ),
        )
        used.add(best[0])
        selected.append((category, best[0], best[1]))
    return selected

def write_assets(selected):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    mapping = []
    for category, original_name, img in selected:
        bbox = img.getchannel("A").getbbox()
        if not bbox:
            raise RuntimeError(f"Transparent-only image selected: {original_name}")
        img = img.crop(bbox)
        img.thumbnail((146, 146), Image.Resampling.LANCZOS)
        square = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
        square.alpha_composite(img, ((160 - img.width) // 2, (160 - img.height) // 2))
        target = OUT_DIR / f"monster-{category}.png"
        square.save(target, "PNG", optimize=True)
        mapping.append((category, original_name, len(target.read_bytes())))
        print(f"Created {target}: {original_name}, {target.stat().st_size} bytes")
    text = """# Ghost Typing – monster image credits

Selected monsters are from **Monster 2D Game Objects** by **CraftPix.net 2D Game Assets**.

- Source: https://opengameart.org/content/monster-2d-game-objects
- Original archive: https://opengameart.org/sites/default/files/Monsters-PNG.zip
- License: **OGA-BY 3.0**: https://static.opengameart.org/OGA-BY-3.0.txt
- Modifications: cropped, resized, and centered for use as in-game units; the opponent's image is mirrored with CSS.
- These credited assets are used inside the game, not offered as a standalone graphics pack.

## File mapping

""" + "\n".join(f"- monster-{category}.png ← {original_name} (optimized size {size} bytes)" for category, original_name, size in mapping) + "\n"
    (OUT_DIR / "ATTRIBUTION.md").write_text(text, encoding="utf-8")
    assert len({item[1] for item in mapping}) == 3

def main():
    packed = download_pack()
    pictures = load_images(packed)
    print(f"Downloaded {len(packed)} bytes; {len(pictures)} PNG sprites found")
    write_assets(choose(pictures))

if __name__ == "__main__":
    main()
