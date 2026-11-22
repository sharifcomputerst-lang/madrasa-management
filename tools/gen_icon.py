#!/usr/bin/env python3
"""Generate launcher icons without external dependencies."""
import math, struct, zlib, os

def png_chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    return c + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

def write_png(path, w, h, px):
    raw = b""
    for y in range(h):
        raw += b"\x00"
        for x in range(w):
            r, g, b, a = px(x, y)
            raw += struct.pack("4B", r, g, b, a)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    data = png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", zlib.compress(raw)) + png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + data)

GREEN = (11, 92, 70, 255)
GREEN_D = (8, 72, 55, 255)
WHITE = (255, 255, 255, 255)
TRANS = (0, 0, 0, 0)

def icon(px_size):
    w = h = px_size
    r = px_size * 0.18  # rounded corner radius

    def shape(x, y):
        # transparent outside rounded-rect corners
        cx, cy = min(max(x, r), w - r), min(max(y, r), h - r)
        if (x - (w - r) > 0 and y - (h - r) > 0 and (x - (w - r))**2 + (y - (h - r))**2 > r*r):
            return False
        return True

    def px(x, y):
        if not shape(x, y):
            return TRANS
        # subtle vertical gradient
        t = y / h
                # crescent + star drawn in white circle-ish area centered
        cx, cy = w/2, h/2
        # crescent: subtract offset circle from main circle
        mainR = 0.30 * w
        d1 = math.hypot(x - cx, y - cy)
        cutx, cuty = cx + 0.13 * w, cy - 0.05 * w
        d2 = math.hypot(x - cutx, y - cuty)
        cutR = 0.26 * w
        if d1 <= mainR and d2 > cutR:
            return WHITE
        # star: 5 spikes approximated by small diamond
        sx, sy = cx + 0.42 * w, cy - 0.34 * w
        d3 = math.hypot(x - sx, y - sy)
        if d3 <= 0.07 * w:
            # diamond hole to make it look like a star
            if abs(x - sx) + abs(y - sy) <= 0.07 * w * 1.4:
                return WHITE
        return GREEN if t < 0.55 else GREEN_D

    return lambda x, y: px(x, y)

sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
res = os.path.join(os.path.dirname(__file__), "..", "res")
for name, size in sizes.items():
    folder = os.path.join(res, "mipmap-" + name)
    os.makedirs(folder, exist_ok=True)
    write_png(os.path.join(folder, "ic_launcher.png"), size, size, icon(size))
    print("wrote", folder, size)
