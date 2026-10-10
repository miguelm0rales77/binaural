"""Genera los iconos de la PWA (dos ondas de frecuencia ligeramente distinta). Requiere Pillow.
Uso: python3 scripts/make-icons.py
"""
import math
from PIL import Image, ImageDraw

BG = (15, 18, 24)
BLUE = (106, 169, 255)
GREEN = (123, 216, 143)
SS = 4  # supersampling


def icon(size, maskable=False):
    s = size * SS
    img = Image.new("RGBA", (s, s), BG + (255,))
    d = ImageDraw.Draw(img)
    if not maskable:  # esquinas redondeadas, fuera transparente
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=255)
        img = Image.composite(img, Image.new("RGBA", (s, s), (0, 0, 0, 0)), mask)
        d = ImageDraw.Draw(img)
    zone = 0.58 if maskable else 0.74  # los maskable deben caber en el 80 % central
    w = s * zone
    x0 = (s - w) / 2
    amp = s * (0.15 if maskable else 0.19)
    stroke = max(2, int(s * 0.04))
    r = stroke / 2
    for freq, colour, phase in ((2.0, BLUE, 0.0), (2.35, GREEN, 0.4)):
        n = 2500  # círculos muy juntos = trazo limpio, sin artefactos en las uniones
        for i in range(n + 1):
            t = i / n
            env = math.sin(math.pi * t) ** 0.6  # extremos suaves
            x = x0 + w * t
            y = s / 2 - amp * env * math.sin(2 * math.pi * freq * t + phase)
            d.ellipse((x - r, y - r, x + r, y + r), fill=colour + (255,))
    return img.resize((size, size), Image.LANCZOS)


icon(192).save("public/icon-192.png")
icon(512).save("public/icon-512.png")
icon(512, maskable=True).save("public/icon-maskable-512.png")
icon(180, maskable=True).save("public/apple-touch-icon.png")  # iOS aplica sus propias esquinas
print("iconos generados")
