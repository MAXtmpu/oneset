#!/usr/bin/env python3
"""Generate the app icons (pure stdlib PNG writer): a bold '1' bar beside a rising ring arc."""
import math, struct, zlib, os

BG = (15, 17, 21)
ACCENT = (255, 106, 43)
DIM = (48, 52, 62)

def png(path, size):
    px = [[BG for _ in range(size)] for _ in range(size)]
    s = size / 512.0
    cx, cy, r_out, r_in = 256 * s, 256 * s, 190 * s, 150 * s
    for y in range(size):
        for x in range(size):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = math.hypot(dx, dy)
            if r_in <= d <= r_out:
                ang = (math.degrees(math.atan2(dx, -dy)) + 360) % 360  # 0 at top, clockwise
                px[y][x] = ACCENT if ang <= 300 else DIM
            # central "1" bar
            if 226 * s <= x <= 286 * s and 168 * s <= y <= 344 * s:
                px[y][x] = (240, 239, 236)
            if 196 * s <= x <= 226 * s and 168 * s <= y <= 198 * s and (y - 168 * s) >= (226 * s - x) * 0.0 and (y - 168 * s) <= 30 * s - (226 * s - x) * 0.6:
                px[y][x] = (240, 239, 236)
    raw = b''.join(b'\x00' + bytes([c for p in row for c in p]) for row in px)
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(data)

here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
os.makedirs(here, exist_ok=True)
for n in (180, 192, 512):
    png(os.path.join(here, f'icon-{n}.png'), n)
print('icons written')
