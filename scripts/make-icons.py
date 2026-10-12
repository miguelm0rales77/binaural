"""Genera los iconos de la PWA a partir de assets/icon-source.png (Pillow).
Uso: python3 scripts/make-icons.py

La imagen original trae las esquinas redondeadas pintadas en BLANCO opaco. Se detectan (relleno desde las
esquinas) y se convierten en transparencia; de ahí salen tres variantes:
  - icon-192.png / icon-512.png   esquinas redondeadas con transparencia (Android «any», instalador de escritorio)
  - icon-maskable-512.png         a sangre, con el dibujo al 80 % dentro de la zona segura (Android adaptativo)
  - apple-touch-icon.png (180)    cuadrado a sangre, sin transparencia (iOS pone sus propias esquinas)
"""
from PIL import Image, ImageChops, ImageDraw, ImageFilter

SRC = "assets/icon-source.png"
DARK = (0, 0, 0)  # el fondo del dibujo es negro puro (el azulado de los bordes es solo el resplandor de la onda)


def transparent_corners(im):
    """Quita el blanco opaco de las esquinas: transparente fuera, y borde suavizado sin halo blanco."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    marked = rgb.copy()
    for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        ImageDraw.floodfill(marked, xy, (255, 0, 255), thresh=14)
    core = ImageChops.difference(marked, rgb).convert("L").point(lambda v: 255 if v else 0)  # blanco de las esquinas
    band = core.filter(ImageFilter.MaxFilter(5))  # + 2 px: la franja de antialiasing blanco→negro
    out = rgb.convert("RGBA")
    px, lum, cpx, bpx = out.load(), rgb.convert("L").load(), core.load(), band.load()
    for y in range(h):
        for x in range(w):
            if cpx[x, y]:
                px[x, y] = DARK + (0,)
            elif bpx[x, y]:
                # píxel mezcla de blanco y negro: la parte de «negro» es la cobertura real
                cover = max(0.0, min(1.0, (255 - lum[x, y]) / (255 - DARK[1])))
                px[x, y] = DARK + (round(255 * cover),)
    return out


def full_bleed(rounded):
    bg = Image.new("RGBA", rounded.size, DARK + (255,))
    bg.alpha_composite(rounded)
    return bg.convert("RGB")


src = Image.open(SRC).convert("RGBA")
rounded = transparent_corners(src)
flat = full_bleed(rounded)

for size in (192, 512):
    rounded.resize((size, size), Image.LANCZOS).save(f"public/icon-{size}.png")

# maskable: dibujo al 80 % centrado sobre el mismo fondo, con el borde suavizado para que no se vea costura
inner = int(512 * 0.80)
art = flat.resize((inner, inner), Image.LANCZOS).convert("RGBA")
feather = Image.new("L", (inner, inner), 0)
ImageDraw.Draw(feather).rectangle((6, 6, inner - 7, inner - 7), fill=255)
art.putalpha(feather.filter(ImageFilter.GaussianBlur(5)))
mask_icon = Image.new("RGBA", (512, 512), DARK + (255,))
mask_icon.alpha_composite(art, ((512 - inner) // 2, (512 - inner) // 2))
mask_icon.convert("RGB").save("public/icon-maskable-512.png")

flat.resize((180, 180), Image.LANCZOS).save("public/apple-touch-icon.png")
print("iconos generados desde", SRC)
