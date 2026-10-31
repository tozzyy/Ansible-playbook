#!/usr/bin/env python3
"""
Render the drawing sheets used by the 2D Verification Overlay into public/sheets/.

The PNGs are rendered from the user's local PDF and are git-ignored on purpose:
the title blocks contain personal data (owner, engineers, phone numbers, site)
and must not be published in a public repository.

Usage:  python3 scripts/render_sheets.py /path/to/House-Phrae_Core+Infra_20p.pdf [dpi]
"""
import json
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
SHEETS = json.loads((ROOT / "data" / "inputs" / "sheets.json").read_text())


def main(pdf, dpi=200):
    out = ROOT / "public" / "sheets"
    out.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(pdf)
    zoom = dpi / 72
    for s in SHEETS["sheets"]:
        page = doc[s["pdfPage"] - 1]
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
        path = out / f'{s["sheet"]}.png'
        pix.save(path)
        print(path.relative_to(ROOT), pix.width, "x", pix.height)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 200)
