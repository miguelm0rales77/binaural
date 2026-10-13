"""Genera los iconos de la PWA con el estilo de marca de Como Sentirse Bien (Pillow). Sin imágenes de origen: se dibujan.
Uso: python3 scripts/make-icons.py [auriculares|corazon]      (por defecto: auriculares)

Estilo (DESIGN.md): iconografía lineal de trazo uniforme y extremos redondeados, verde bosque #1D342E y oro #A18039
sobre crema #FAF5EF; sin degradados, sin neón, sin negro puro.
Salidas:
  public/icon-192.png, icon-512.png   esquinas redondeadas con transparencia (Android «any»)
  public/icon-maskable-512.png        a sangre, dibujo dentro de la zona segura del 80 % (Android adaptativo)
  public/apple-touch-icon.png (180)   cuadrado a sangre, sin transparencia (iOS pone sus propias esquinas)
"""
import math
import sys

from PIL import Image, ImageDraw

CREMA = (250, 245, 239)
VERDE = (29, 52, 46)
ORO = (161, 128, 57)
SS = 4  # supersampling
N = 1024 * SS  # lienzo de dibujo (el arte se define en coordenadas 0–1)
STROKE = 0.034  # grosor de trazo, como fracción del lienzo


def pen(d, pts, colour, width=STROKE, closed=False):
    """Trazo continuo de extremos redondeados: círculos muy juntos a lo largo de la curva."""
    r = width * N / 2
    pts = list(pts) + ([pts[0]] if closed else [])
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        steps = max(1, int(math.hypot(x1 - x0, y1 - y0) * N / (r * 0.5)))
        for i in range(steps + 1):
            t = i / steps
            x, y = (x0 + (x1 - x0) * t) * N, (y0 + (y1 - y0) * t) * N
            d.ellipse((x - r, y - r, x + r, y + r), fill=colour)


def wave(cx0, cx1, cy, amp, cycles, phase=0.0, vertical=False, n=500):
    pts = []
    for i in range(n + 1):
        t = i / n
        a = cx0 + (cx1 - cx0) * t
        b = cy + amp * math.sin(2 * math.pi * cycles * t + phase)
        pts.append((b, a) if vertical else (a, b))
    return pts


def arc(cx, cy, r, a0, a1, n=240):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def rounded_rect(x0, y0, x1, y1, rad, n=40):
    pts = []
    for cx, cy, a0 in ((x1 - rad, y0 + rad, -90), (x1 - rad, y1 - rad, 0), (x0 + rad, y1 - rad, 90), (x0 + rad, y0 + rad, 180)):
        pts += arc(cx, cy, rad, a0, a0 + 90, n)
    return pts


def art_auriculares(d):
    """Auriculares (dos oídos) con una onda en cada copa: «binaural»."""
    pen(d, arc(0.5, 0.52, 0.30, 180, 360), VERDE)
    pen(d, [(0.2, 0.52), (0.2, 0.6)], VERDE)
    pen(d, [(0.8, 0.52), (0.8, 0.6)], VERDE)
    pen(d, rounded_rect(0.155, 0.58, 0.285, 0.8, 0.05), VERDE, closed=True)
    pen(d, rounded_rect(0.715, 0.58, 0.845, 0.8, 0.05), VERDE, closed=True)
    # onda central con envolvente de batido: dos tonos casi iguales suenan como uno que «pulsa» (el efecto binaural)
    pts = []
    for i in range(601):
        t = i / 600
        envelope = math.cos(2 * math.pi * (t - 0.5))  # lisa: lóbulo central grande y dos laterales, con nulos entre ellos
        pts.append((0.31 + 0.38 * t, 0.53 + 0.1 * envelope * math.sin(2 * math.pi * 5 * t)))
    pen(d, pts, ORO, STROKE * 0.85)


def art_corazon(d):
    """Corazón con una onda que lo cruza (y una segunda algo desfasada)."""
    pts = []
    for i in range(361):
        t = math.radians(i)
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((0.5 + x * 0.0215, 0.46 - y * 0.0215))
    pen(d, pts, VERDE, closed=True)
    pen(d, wave(0.24, 0.76, 0.5, 0.06, 3.0), ORO, STROKE * 0.85)


VARIANTS = {"auriculares": art_auriculares, "corazon": art_corazon}


def draw(variant):
    art = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    VARIANTS[variant](ImageDraw.Draw(art))
    return art


def compose(art, size, mode):
    """mode: 'any' (esquinas redondeadas transparentes) · 'flat' (cuadrado a sangre) · 'maskable' (arte al 80 %)"""
    scale = 0.80 if mode == "maskable" else 0.84
    inner = int(N * scale)
    a = art.resize((inner, inner), Image.LANCZOS)
    base = Image.new("RGBA", (N, N), CREMA + (255,))
    base.alpha_composite(a, ((N - inner) // 2, (N - inner) // 2))
    if mode == "any":
        mask = Image.new("L", (N, N), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, N - 1, N - 1), radius=int(N * 0.22), fill=255)
        out = Image.new("RGBA", (N, N), CREMA + (0,))
        out.paste(base, (0, 0), mask)
        base = out
    img = base.resize((size, size), Image.LANCZOS)
    return img if mode == "any" else img.convert("RGB")


if __name__ == "__main__":
    variant = sys.argv[1] if len(sys.argv) > 1 else "auriculares"
    if variant not in VARIANTS:
        sys.exit(f"Variante desconocida: {variant}. Opciones: {', '.join(VARIANTS)}")
    art = draw(variant)
    compose(art, 192, "any").save("public/icon-192.png")
    compose(art, 512, "any").save("public/icon-512.png")
    compose(art, 512, "maskable").save("public/icon-maskable-512.png")
    compose(art, 180, "flat").save("public/apple-touch-icon.png")
    print("iconos generados (variante:", variant + ")")
