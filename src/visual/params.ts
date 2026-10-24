/**
 * Presets y ajustes de la vista fractal (§C4 y §C2 del plan). Funciones puras: sin WebGL ni DOM.
 */
import { PALETTES, type Palette } from './cpuField'

export type PaletteId = keyof typeof PALETTES

export interface VisualParams {
  /** Exponente de Hurst H, 0,5–0,9 (por defecto 0,65 ⇒ D ≈ 1,35). */
  hurst: number
  /** Domain warping, 0–4. */
  warp: number
  /** Velocidad relativa, 0,2–1,0 (los presets van de 0,4 a 1,0). */
  speed: number
  /** Brillo 0–1; en modo noche se limita a 0,35. */
  brightness: number
  palette: PaletteId
  /** Modo noche: paleta cálida y brillo máximo del 35 % (§C2.4). */
  night: boolean
  /**
   * Octavas del fBm (1–6). El plan dice 6, pero con 6 la dimensión medida (box-counting) queda ≈ 1,8 y no entra en
   * 1,25–1,55; por eso cada preset usa 2 o 3, el valor más alto que cumple la medida (ver DECISIONES.md, Fase 14).
   */
  octaves: number
  /**
   * Semilla del ruido: cada preset tiene la suya, así la forma del fractal es distinta en cada uno.
   * Con la misma semilla, los presets solo cambiaban de color y de deformación, y el dibujo parecía igual.
   * Las semillas elegidas dan una dimensión dentro de 1,25–1,55 (ver DECISIONES.md, Bloque C).
   */
  seed: number
}

export interface VisualPreset {
  id: 'relax' | 'focus' | 'meditation' | 'sleep' | 'gamma' | 'breath'
  name: string
  params: VisualParams
}

/** Tabla de §C4 del plan, con los parámetros que la completan (brillo y modo noche). */
export const VISUAL_PRESETS: readonly VisualPreset[] = [
  {
    id: 'relax',
    name: 'Relajación (alfa)',
    params: { hurst: 0.65, warp: 2.5, speed: 1.0, brightness: 0.8, palette: 'calm', night: false, octaves: 2, seed: 19 },
  },
  {
    id: 'focus',
    name: 'Concentración (beta)',
    params: { hurst: 0.7, warp: 1.5, speed: 0.6, brightness: 0.6, palette: 'focus', night: false, octaves: 3, seed: 37 },
  },
  {
    id: 'meditation',
    name: 'Meditación (theta)',
    params: { hurst: 0.6, warp: 3.0, speed: 0.8, brightness: 0.8, palette: 'depth', night: false, octaves: 2, seed: 127 },
  },
  {
    id: 'sleep',
    name: 'Pre-sueño',
    params: { hurst: 0.7, warp: 2.0, speed: 0.4, brightness: 0.35, palette: 'night', night: true, octaves: 3, seed: 71 },
  },
  {
    id: 'gamma',
    name: 'Reflexión (gamma)',
    params: { hurst: 0.65, warp: 2.0, speed: 0.6, brightness: 0.7, palette: 'neutral', night: false, octaves: 3, seed: 89 },
  },
  {
    id: 'breath',
    name: 'Respiración (sin audio)',
    params: { hurst: 0.65, warp: 2.5, speed: 0.7, brightness: 0.7, palette: 'teal', night: false, octaves: 2, seed: 101 },
  },
]

/** Rangos de los controles avanzados (§C4 y §C2). */
export const VISUAL_RANGES = {
  hurst: { min: 0.5, max: 0.9 },
  warp: { min: 0, max: 4 },
  speed: { min: 0.2, max: 1 },
  brightness: { min: 0, max: 1 },
  nightBrightness: 0.35,
} as const

/** Preset visual que acompaña a cada preset de audio (el de respiración usa «Respiración»). */
export function visualPresetFor(audioPresetId: string | null): VisualPreset {
  const id: VisualPreset['id'] =
    audioPresetId === 'relax-alpha'
      ? 'relax'
      : audioPresetId === 'focus-beta'
        ? 'focus'
        : audioPresetId === 'meditation-theta'
          ? 'meditation'
          : audioPresetId === 'pre-sleep'
            ? 'sleep'
            : audioPresetId === 'gamma-40'
              ? 'gamma'
              : 'relax'
  return VISUAL_PRESETS.find((p) => p.id === id) as VisualPreset
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/** Ajusta los parámetros a sus rangos. En modo noche el brillo no puede superar el 35 %. */
export function sanitizeVisual(p: VisualParams): VisualParams {
  const brightness = clamp(p.brightness, VISUAL_RANGES.brightness.min, VISUAL_RANGES.brightness.max)
  return {
    hurst: clamp(p.hurst, VISUAL_RANGES.hurst.min, VISUAL_RANGES.hurst.max),
    warp: clamp(p.warp, VISUAL_RANGES.warp.min, VISUAL_RANGES.warp.max),
    speed: clamp(p.speed, VISUAL_RANGES.speed.min, VISUAL_RANGES.speed.max),
    brightness: p.night ? Math.min(brightness, VISUAL_RANGES.nightBrightness) : brightness,
    palette: p.palette in PALETTES ? p.palette : 'calm',
    night: p.night,
    octaves: Math.round(clamp(p.octaves, 1, 6)),
    seed: Math.round(clamp(p.seed, 1, 9999)),
  }
}

/**
 * Acerca `cur` a `target` con una constante de tiempo `tau` (s) en un paso `dt` (s).
 * Con tau = 1 s, a los 3 s ya está al 95 %: así se interpola el cambio de preset «durante unos 3 s».
 */
export function approach(cur: number, target: number, dt: number, tau = 1): number {
  const k = 1 - Math.exp(-dt / tau)
  return cur + (target - cur) * k
}

/** Paleta concreta de un id, sin depender de la tabla. */
export function paletteOf(id: PaletteId): Palette {
  return PALETTES[id]
}
