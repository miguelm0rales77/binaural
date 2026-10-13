/**
 * Parámetros del fractal estadístico (Bloque C). TypeScript puro: la GPU y la copia en CPU
 * (cpuField.ts) usan estas mismas fórmulas.
 */
export type Vec3 = readonly [number, number, number]

/** Paleta coseno: color = a + b·cos(2π·(c·t + d)). */
export interface Palette {
  a: Vec3
  b: Vec3
  c: Vec3
  d: Vec3
}

export interface VisualPreset {
  id: string
  name: string
  palette: Palette
  /** Exponente de Hurst: con lacunaridad 2, gain = 2^(−H). Objetivo D ≈ 2 − H entre 1,3 y 1,5. */
  hurst: number
  /** Intensidad del domain warping, 0–4. */
  warp: number
  /** Velocidad de deriva (1 = la de referencia). */
  speed: number
  /** Modo noche: paleta cálida y brillo máximo del 35 %. */
  night?: boolean
}

export const HURST_MIN = 0.4
export const HURST_MAX = 0.9
export const WARP_MIN = 0
export const WARP_MAX = 4
/** Tope de brillo en el modo noche (sueño). */
export const NIGHT_MAX_BRIGHTNESS = 0.35

export const gainFromHurst = (h: number): number => Math.pow(2, -h)

/** Deriva máxima de la coordenada: 0,03 unidades por segundo (el shader usa 0,010 y 0,008 y el factor de velocidad). */
export const MAX_DRIFT_PER_SEC = 0.03

const SOFT: Palette = { a: [0.45, 0.5, 0.5], b: [0.3, 0.3, 0.3], c: [1, 1, 0.8], d: [0.3, 0.45, 0.6] }
const NEUTRAL: Palette = { a: [0.5, 0.5, 0.5], b: [0.12, 0.12, 0.12], c: [1, 1, 1], d: [0, 0.33, 0.67] }
const DEEP: Palette = { a: [0.3, 0.25, 0.5], b: [0.3, 0.25, 0.4], c: [1, 1, 1], d: [0.55, 0.6, 0.7] }
const AMBER: Palette = { a: [0.35, 0.2, 0.05], b: [0.3, 0.2, 0.05], c: [1, 1, 0.5], d: [0, 0.1, 0.15] }
const TEAL: Palette = { a: [0.3, 0.5, 0.5], b: [0.25, 0.3, 0.3], c: [1, 1, 1], d: [0.5, 0.6, 0.7] }

/** Presets visuales (tabla C4). Ligados al preset de audio; «Respiración» funciona sin audio. */
export const VISUAL_PRESETS: readonly VisualPreset[] = [
  { id: 'relax-alpha', name: 'Relajación (alfa)', palette: SOFT, hurst: 0.65, warp: 2.5, speed: 1.0 },
  { id: 'focus-beta', name: 'Concentración (beta)', palette: NEUTRAL, hurst: 0.7, warp: 1.5, speed: 0.6 },
  { id: 'meditation-theta', name: 'Meditación (theta)', palette: DEEP, hurst: 0.6, warp: 3.0, speed: 0.8 },
  { id: 'pre-sleep', name: 'Pre-sueño', palette: AMBER, hurst: 0.7, warp: 2.0, speed: 0.4, night: true },
  { id: 'gamma-40', name: 'Reflexión (gamma)', palette: NEUTRAL, hurst: 0.65, warp: 2.0, speed: 0.6 },
  { id: 'breath-only', name: 'Respiración (sin audio)', palette: TEAL, hurst: 0.65, warp: 2.5, speed: 0.7 },
]

export interface VisualSettings {
  hurst: number
  warp: number
  speed: number
  /** 0–1; en modo noche se limita a NIGHT_MAX_BRIGHTNESS. */
  brightness: number
  palette: Palette
  night: boolean
  seed: number
}

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/** Ajusta los ajustes a rangos seguros; en modo noche aplica el tope de brillo. */
export function sanitizeVisual(s: VisualSettings): VisualSettings {
  const brightness = clamp(s.brightness, 0, s.night ? NIGHT_MAX_BRIGHTNESS : 1)
  return {
    ...s,
    hurst: clamp(s.hurst, HURST_MIN, HURST_MAX),
    warp: clamp(s.warp, WARP_MIN, WARP_MAX),
    speed: clamp(s.speed, 0, 2),
    brightness,
    seed: Math.max(0, Math.floor(s.seed)) >>> 0,
  }
}

/** Valores de un preset visual (sin cambiar brillo, semilla ni noche del usuario). */
export function settingsFromPreset(p: VisualPreset, base: VisualSettings): VisualSettings {
  return sanitizeVisual({ ...base, hurst: p.hurst, warp: p.warp, speed: p.speed, palette: p.palette, night: p.night ?? base.night })
}

/** Ajustes iniciales de la vista (preset «Relajación (alfa)»). */
export const DEFAULT_VISUAL: VisualSettings = settingsFromPreset(VISUAL_PRESETS[0] as VisualPreset, {
  hurst: 0.65,
  warp: 2.5,
  speed: 1,
  brightness: 0.8,
  palette: SOFT,
  night: false,
  seed: 7,
})

/** Velocidad efectiva con «reducir movimiento»: el fractal casi no se mueve (×0,1). */
export const motionScale = (reducedMotion: boolean): number => (reducedMotion ? 0.1 : 1)
