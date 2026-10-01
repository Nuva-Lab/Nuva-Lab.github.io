"""Render the homepage social card from its actual headline and subtitle.

Usage: python scripts/render-social-card.py --output assets/nuva-social-2026-09-30-v2.png
Requires Pillow. Set --regular-font and --bold-font when Arial is unavailable.
"""
import argparse
from html.parser import HTMLParser
from pathlib import Path
import re
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]


class CopyParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lines = [[]]
        self.highlight = False

    def handle_starttag(self, tag, attrs):
        if tag == "br":
            self.lines.append([])
        if tag == "span":
            self.highlight = dict(attrs).get("class") == "highlight"

    def handle_endtag(self, tag):
        if tag == "span":
            self.highlight = False

    def handle_data(self, data):
        self.lines[-1].append((data, self.highlight))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--regular-font", default="/System/Library/Fonts/Supplemental/Arial.ttf")
    parser.add_argument("--bold-font", default="/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    args = parser.parse_args()
    html = (ROOT / "index.html").read_text()
    headline = CopyParser()
    headline.feed(re.search(r'<h1 id="hero-title">(.*?)</h1>', html, re.S)[1])
    subtitle = CopyParser()
    subtitle.feed(re.search(r'<p class="hero__subtitle">(.*?)</p>', html, re.S)[1])
    subtitle_text = " ".join("".join(text for text, _ in line) for line in subtitle.lines)
    if len(headline.lines) != 3:
        raise ValueError("Review social-card layout: expected three headline lines")
    image = Image.new("RGB", (1200, 630), "#f7f7f3")
    draw = ImageDraw.Draw(image)
    bold = ImageFont.truetype(args.bold_font, 64)
    body = ImageFont.truetype(args.regular_font, 28)
    brand = ImageFont.truetype(args.bold_font, 38)
    small = ImageFont.truetype(args.regular_font, 24)
    draw.rectangle((0, 0, 1200, 12), fill="#83f8f8")
    draw.text((64, 58), "Nuva Lab", font=brand, fill="#1e1e1e", anchor="lt")
    for i, line in enumerate(headline.lines):
        x, y = 64, 165 + i * 80
        for text, highlighted in line:
            width = draw.textlength(text, font=bold)
            if x + width > 1136:
                raise ValueError("Headline exceeds card width")
            if highlighted:
                draw.rectangle((x - 3, y + 30, x + width + 3, y + 64), fill="#83f8f8")
            draw.text((x, y), text, font=bold, fill="#1e1e1e", anchor="lt")
            x += width
    lines = [""]
    for word in subtitle_text.split():
        candidate = (lines[-1] + " " + word).strip()
        if draw.textlength(candidate, font=body) > 1060:
            lines.append(word)
        else:
            lines[-1] = candidate
    if len(lines) > 2:
        raise ValueError("Subtitle exceeds two lines; review layout")
    for i, line in enumerate(lines):
        draw.text((64, 452 + i * 38), line, font=body, fill="#4a5554", anchor="lt")
    draw.text((64, 568), "nuvalab.ai", font=small, fill="#00717c", anchor="lt")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, optimize=True)
    # Cached page metadata may still request the legacy image URL.
    image.save(ROOT / "assets/nuva-social.png", optimize=True)
    print(f"Saved {args.output}: {image.width}x{image.height}")


if __name__ == "__main__":
    main()
