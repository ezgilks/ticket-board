"""Stitch the frames from tests/demo.record.spec.ts into docs/demo.gif.

Each frame is two screenshots, one per user, placed side by side with a label above each.
Needs Pillow (`pip install pillow`). Run from e2e/: `npm run demo-gif` does both steps.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FRAMES = Path("demo-frames")
OUT = Path("../docs/demo.gif")
SCALE = 0.5  # 2 × 1000px wide → ~1000px: sharp on GitHub, small enough to load fast
GAP, LABEL_H = 12, 34
BG = (241, 245, 249)  # Tailwind slate-100, matches the app
FRAME_MS = 90


def font(size: int) -> ImageFont.ImageFont:
    for path in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main() -> None:
    ids = sorted({p.name.split("-")[0] for p in FRAMES.glob("*-a.png")})
    if not ids:
        raise SystemExit("no frames: run the recording first (npm run demo-gif)")

    label_font = font(15)
    frames = []
    for i in ids:
        a = Image.open(FRAMES / f"{i}-a.png").convert("RGB")
        b = Image.open(FRAMES / f"{i}-b.png").convert("RGB")
        w, h = int(a.width * SCALE), int(a.height * SCALE)
        a, b = a.resize((w, h), Image.LANCZOS), b.resize((w, h), Image.LANCZOS)

        canvas = Image.new("RGB", (w * 2 + GAP * 3, h + LABEL_H + GAP), BG)
        draw = ImageDraw.Draw(canvas)
        for x, who in ((GAP, "Alice drags and adds tickets"), (GAP * 2 + w, "Bob's screen updates live")):
            draw.text((x + 2, 9), who, fill=(51, 65, 85), font=label_font)
        canvas.paste(a, (GAP, LABEL_H))
        canvas.paste(b, (GAP * 2 + w, LABEL_H))
        frames.append(canvas)

    # One shared palette for every frame keeps colours stable and the file small.
    palette = frames[len(frames) // 2].quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    quantized = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    quantized[0].save(OUT, save_all=True, append_images=quantized[1:], duration=FRAME_MS, loop=0, optimize=True)
    print(f"wrote {OUT} ({len(frames)} frames, {OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
