# Generates the app icons and the link-preview image (public/img). Run once:
#   python3 scripts/make-images.py
from PIL import Image, ImageDraw, ImageFont
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'img')
os.makedirs(OUT, exist_ok=True)
BG = (11, 13, 18); G = (34, 197, 94); Y = (234, 179, 8); R = (239, 68, 68); INK = (3, 33, 14); W = (243, 245, 250); MUTED = (154, 164, 184)
FONT = '/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf'

def font(size):
    return ImageFont.truetype(FONT, size)

def tile(d, x, y, s, color, letter=None, ink=W):
    d.rounded_rectangle([x, y, x + s, y + s], radius=int(s * 0.18), fill=color)
    if letter:
        f = font(int(s * 0.62))
        w = d.textlength(letter, font=f)
        d.text((x + (s - w) / 2, y + s * 0.15), letter, font=f, fill=ink)

def icon(size):
    im = Image.new('RGB', (size, size), BG)
    d = ImageDraw.Draw(im)
    s = size * 0.36; gap = size * 0.06; o = (size - 2 * s - gap) / 2
    tile(d, o, o, s, G, 'R', INK); tile(d, o + s + gap, o, s, G)
    tile(d, o, o + s + gap, s, Y); tile(d, o + s + gap, o + s + gap, s, R)
    return im

for size in (192, 512):
    icon(size).save(os.path.join(OUT, f'icon-{size}.png'))

# Open Graph / WhatsApp preview 1200x630
im = Image.new('RGB', (1200, 630), BG)
d = ImageDraw.Draw(im)
s, gap = 120, 16
x0 = (1200 - (6 * s + 5 * gap)) / 2
for i, (c, ch) in enumerate(zip([G, G, G, G, Y, R], 'REPDLE')):
    tile(d, x0 + i * (s + gap), 120, s, c, ch, INK if c in (G, Y) else W)
def center(text, y, f, fill):
    w = d.textlength(text, font=f); d.text(((1200 - w) / 2, y), text, font=f, fill=fill)
center('The daily 60-second fitness challenge', 300, font(54), W)
center('Same challenge for the whole world - AI counts your reps', 380, font(32), MUTED)
center('Can you beat me?', 450, font(44), G)
center('Your video never leaves your phone', 530, font(26), (167, 232, 191))
im.save(os.path.join(OUT, 'og.png'), optimize=True)
print('ok')
