/**
 * Dimensión fractal por recuento de cajas (box-counting) del contorno de un campo binario.
 * Campo → umbral en la mediana → contorno (píxeles del conjunto con un vecino de 4 fuera del conjunto;
 * fuera de la imagen no cuenta como fuera) → para cada tamaño ε, N(ε) = mínimo sobre 4 desplazamientos
 * de rejilla → D = pendiente de log N frente a log(1/ε) por mínimos cuadrados.
 */

/** Tamaños de caja: 2, 4, …, 256 píxeles. */
export const BOX_SIZES = [2, 4, 8, 16, 32, 64, 128, 256] as const

/** Contorno del conjunto `v > mediana`. */
export function contourMask(v: Float64Array, w: number, h: number): Uint8Array {
  const sorted = Float64Array.from(v).sort()
  const median = sorted[Math.floor(sorted.length / 2)] as number
  const inside = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) inside[i] = (v[i] as number) > median ? 1 : 0
  const edge = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!inside[i]) continue
      const outside =
        (x > 0 && !inside[i - 1]) ||
        (x < w - 1 && !inside[i + 1]) ||
        (y > 0 && !inside[i - w]) ||
        (y < h - 1 && !inside[i + w])
      if (outside) edge[i] = 1
    }
  }
  return edge
}

/** Número de cajas de tamaño `e` con al menos un píxel del contorno, con desplazamiento (ox, oy) < e. */
function countBoxes(mask: Uint8Array, w: number, h: number, e: number, ox: number, oy: number): number {
  const nx = Math.ceil((w + ox) / e)
  const ny = Math.ceil((h + oy) / e)
  const seen = new Uint8Array(nx * ny)
  let n = 0
  for (let y = 0; y < h; y++) {
    const by = Math.floor((y + oy) / e) * nx
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      const idx = by + Math.floor((x + ox) / e)
      if (!seen[idx]) {
        seen[idx] = 1
        n++
      }
    }
  }
  return n
}

/** N(ε): mínimo sobre cuatro desplazamientos de rejilla (0, 0), (ε/2, 0), (0, ε/2) y (ε/2, ε/2). */
export function boxCount(mask: Uint8Array, w: number, h: number, e: number): number {
  const half = e / 2
  let best = Infinity
  for (const [ox, oy] of [[0, 0], [half, 0], [0, half], [half, half]] as const) {
    best = Math.min(best, countBoxes(mask, w, h, e, ox, oy))
  }
  return best
}

/** Dimensión: pendiente por mínimos cuadrados de log N frente a log(1/ε). */
export function fractalDimension(mask: Uint8Array, w: number, h: number, sizes: readonly number[] = BOX_SIZES): number {
  const xs = sizes.map((e) => Math.log(1 / e))
  const ys = sizes.map((e) => Math.log(boxCount(mask, w, h, e)))
  const n = xs.length
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += ((xs[i] as number) - mx) * ((ys[i] as number) - my)
    den += ((xs[i] as number) - mx) ** 2
  }
  return num / den
}
