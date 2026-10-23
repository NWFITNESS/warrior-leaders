# Builds the Warrior Leaders logo kit masters (all shapes as paths — no live text, no font needed).
# Run with a Python that has fonttools + brotli:  python build_kit.py
import math, os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'kit', 'svg')
os.makedirs(OUT, exist_ok=True)
FONT = os.path.join(HERE, 'LeagueSpartan-latin.woff2')

GOLD, BLACK, WHITE = '#aa8601', '#0a0a0a', '#ffffff'
f = lambda v: f'{v:.2f}'.rstrip('0').rstrip('.')

# ── The mark: rising W + forward-leaning L, every stroke at 75° ────────────────
T = math.tan(math.radians(15)); SW = 40; BASE = 216; FOOT = 58

def mark(gap):
    def slant(top, bot):
        (xt, yt), (xb, yb) = top, bot; h = SW / 2
        return [(xt - h, yt), (xt + h, yt), (xb + h, yb), (xb - h, yb)]
    p1, p2, p3 = 120, 88, 56
    T0 = (0, p1); B1 = (T0[0] + (BASE - p1) * T, BASE); T2 = (B1[0] + (BASE - p2) * T, p2)
    B3 = (T2[0] + (BASE - p2) * T, BASE); T4 = (B3[0] + (BASE - p3) * T, p3)
    W = [slant(T0, B1), slant(T2, B1), slant(T2, B3), slant(T4, B3)]
    top, lb = p3, BASE - SW
    gx = T4[0] + SW / 2 + gap            # L runs parallel to the W's last stroke, `gap` apart
    bl = gx - (BASE - top) * T
    br = gx + SW - (lb - top) * T
    L = [(gx, top), (gx + SW, top), (br, lb), (br + FOOT, lb), (br + FOOT, BASE), (bl, BASE)]
    poly = lambda pts: 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + ' Z'
    pts = [p for s in W for p in s] + L
    xs = [x for x, _ in pts]; ys = [y for _, y in pts]
    return {'w': ' '.join(poly(s) for s in W), 'l': poly(L),
            'bbox': (min(xs), min(ys), max(xs), max(ys))}

MAIN = mark(10)    # master
SMALL = mark(18)   # small-size cut (≤ 32 px): wider gap so W and L don't merge

# ── Type: League Spartan ExtraBold, outlined ───────────────────────────────────
font = TTFont(FONT)
font = instantiateVariableFont(font, {'wght': 800})
gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font['head'].unitsPerEm
CAP = font['OS/2'].sCapHeight

def word(text, cap_px, x, y_base, tracking_em=0.04):
    """Outline `text` with its cap height = cap_px, baseline at y_base. Returns (path d, width)."""
    s = cap_px / CAP
    pen = SVGPathPen(gs); cx = 0.0; last_right = 0.0
    for i, ch in enumerate(text):
        g = cmap[ord(ch)]
        if ch != ' ':
            tp = TransformPen(pen, (s, 0, 0, -s, x + cx * s, y_base))
            gs[g].draw(tp)
            bp = BoundsPen(gs); gs[g].draw(bp)
            if bp.bounds: last_right = cx + bp.bounds[2]
        cx += gs[g].width + (tracking_em * upm if i < len(text) - 1 else 0)
    return pen.getCommands(), last_right * s

def ink_left(text, cap_px):
    s = cap_px / CAP; bp = BoundsPen(gs); gs[cmap[ord(text[0])]].draw(bp)
    return bp.bounds[0] * s

def justified(a, b, cap_px, x, y_a, y_b):
    """Two words set to the same width: tracking of the narrower one is opened up."""
    _, wa = word(a, cap_px, 0, 0); _, wb = word(b, cap_px, 0, 0)
    wide, narrow = (a, b) if wa >= wb else (b, a)
    _, W = word(wide, cap_px, 0, 0)
    extra = (W - min(wa, wb)) / (len(narrow) - 1) / (cap_px / CAP) / upm
    out = {}
    for txt, yy in ((a, y_a), (b, y_b)):
        tr = 0.04 + (extra if txt == narrow else 0)
        out[txt] = word(txt, cap_px, x - ink_left(txt, cap_px), yy, tr)[0]
    return out, W

def svg(viewbox, body, title='Warrior Leaders'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}"><title>{title}</title>{body}</svg>\n'

COLOURWAYS = {               # W, L, "WARRIOR", "LEADERS", background
    'colour':  (BLACK, GOLD, BLACK, GOLD, None),
    'reversed': (WHITE, GOLD, WHITE, GOLD, None),       # for dark backgrounds
    'black':   (BLACK, BLACK, BLACK, BLACK, None),
    'white':   (WHITE, WHITE, WHITE, WHITE, None),
    'gold':    (GOLD, GOLD, GOLD, GOLD, None),
}

def write(name, content):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as fh: fh.write(content)

# ── Symbol ─────────────────────────────────────────────────────────────────────
def symbol_files(m, suffix=''):
    x0, y0, x1, y1 = m['bbox']; side = max(x1 - x0, y1 - y0) * 1.16
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 - 2      # optical centre: a touch high
    vb = f'{f(cx - side/2)} {f(cy - side/2)} {f(side)} {f(side)}'
    for cw, (wc, lc, *_rest) in COLOURWAYS.items():
        write(f'symbol{suffix}-{cw}.svg', svg(vb, f'<path d="{m["w"]}" fill="{wc}"/><path d="{m["l"]}" fill="{lc}"/>'))
    return vb
symbol_files(MAIN)
symbol_files(SMALL, '-small')

# ── Horizontal lockup: mark + WARRIOR / LEADERS, same height as the mark ───────
x0, y0, x1, y1 = MAIN['bbox']; H = y1 - y0           # 160
cap = H / 2.34; lead = H - 2 * cap                    # two cap-height lines + gap
tx = x1 + SW * 1.15
words, tw = justified('WARRIOR', 'LEADERS', cap, tx, y0 + cap, y1)
pad = SW
vbH = f'{f(x0 - pad)} {f(y0 - pad)} {f(tx + tw - x0 + 2*pad)} {f(H + 2*pad)}'
for cw, (wc, lc, c1, c2, _) in COLOURWAYS.items():
    write(f'lockup-horizontal-{cw}.svg', svg(vbH,
        f'<path d="{MAIN["w"]}" fill="{wc}"/><path d="{MAIN["l"]}" fill="{lc}"/>'
        f'<path d="{words["WARRIOR"]}" fill="{c1}"/><path d="{words["LEADERS"]}" fill="{c2}"/>'))

# ── Stacked lockup: mark centred over the two-line name ───────────────────────
mw = x1 - x0
cap_s = mw * 0.21
_, tws = justified('WARRIOR', 'LEADERS', cap_s, 0, 0, 0)
ty1 = y1 + SW * 1.1 + cap_s; ty2 = ty1 + cap_s * 1.36
cx = (x0 + x1) / 2
words_s, _ = justified('WARRIOR', 'LEADERS', cap_s, cx - tws / 2, ty1, ty2)
left = min(x0, cx - tws / 2); right = max(x1, cx + tws / 2)
vbS = f'{f(left - pad)} {f(y0 - pad)} {f(right - left + 2*pad)} {f(ty2 - y0 + 2*pad)}'
for cw, (wc, lc, c1, c2, _) in COLOURWAYS.items():
    write(f'lockup-stacked-{cw}.svg', svg(vbS,
        f'<path d="{MAIN["w"]}" fill="{wc}"/><path d="{MAIN["l"]}" fill="{lc}"/>'
        f'<path d="{words_s["WARRIOR"]}" fill="{c1}"/><path d="{words_s["LEADERS"]}" fill="{c2}"/>'))

# ── Wordmark only: WARRIOR LEADERS on one line ────────────────────────────────
capw = 100
d1, w1 = word('WARRIOR', capw, -ink_left('WARRIOR', capw), capw)
gapw = capw * 0.42
d2, w2 = word('LEADERS', capw, w1 + gapw - ink_left('LEADERS', capw), capw)
vbW = f'{f(-capw*0.3)} {f(-capw*0.3)} {f(w1 + gapw + w2 + capw*0.6)} {f(capw*1.6)}'
for cw, (_, _, c1, c2, _) in COLOURWAYS.items():
    write(f'wordmark-{cw}.svg', svg(vbW, f'<path d="{d1}" fill="{c1}"/><path d="{d2}" fill="{c2}"/>'))

print('done:', len(os.listdir(OUT)), 'files in', os.path.normpath(OUT))
