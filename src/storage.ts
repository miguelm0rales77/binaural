import { defaultParams, sanitizeParams } from './dsp/params'
import type { EngineParams, Preset, Program } from './dsp/types'
import { RANGES } from './dsp/params'

export const STORAGE_KEY = 'binaural:state:v1'
export const TIMER_OPTIONS_MIN = [15, 30, 45, 60, 90] as const
export const MAX_TIMER_MIN = 240
/** v2: el aviso de primer uso incorporó la nota de sensibilidad sensorial, así que se vuelve a mostrar una vez. */
export const ACCEPTED_KEY = 'binaural:accepted:v2'
export const ISO_WARNING_KEY = 'binaural:iso-warning-seen:v1'
export const PRESETS_KEY = 'binaural:presets:v1'
export const BREATH_SAFETY_KEY = 'binaural:breath-safety:v1'
export const MAX_USER_PRESETS = 50
export const MAX_NAME_LENGTH = 40

export interface SavedState {
  params: EngineParams
  /** Minutos de sesión; null = sin límite. */
  timerMin: number | null
}

/** Mínimo de Storage que necesitamos (permite inyectar uno falso en los tests). */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export const defaultState = (): SavedState => ({ params: defaultParams(), timerMin: null })

export function sanitizeState(raw: unknown): SavedState {
  const base = defaultState()
  if (typeof raw !== 'object' || raw === null) return base
  const r = raw as { params?: unknown; timerMin?: unknown }
  const params =
    typeof r.params === 'object' && r.params !== null
      ? sanitizeParams(base.params, r.params as Partial<Record<keyof EngineParams, unknown>>)
      : base.params
  return { params, timerMin: sanitizeMinutes(r.timerMin) }
}

/** Minutos enteros 1–240 (los presets pueden sugerir duraciones fuera de la lista fija, p. ej. 20). */
export function sanitizeMinutes(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_TIMER_MIN ? v : null
}

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null // modo privado, datos bloqueados…
  }
}

export function loadState(storage: StorageLike | null = browserStorage()): SavedState {
  try {
    const text = storage?.getItem(STORAGE_KEY)
    return text ? sanitizeState(JSON.parse(text)) : defaultState()
  } catch {
    return defaultState()
  }
}

export function saveState(state: SavedState, storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // cuota llena o almacenamiento no disponible: la app funciona igual
  }
}

const clampTo = (v: number, r: { min: number; max: number }) => Math.max(r.min, Math.min(r.max, v))
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function sanitizeProgram(raw: unknown): Program | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as { name?: unknown; durationSec?: unknown; steps?: unknown }
  if (!isNum(r.durationSec) || r.durationSec <= 0 || !Array.isArray(r.steps)) return undefined
  const steps = r.steps
    .filter((s): s is { atSec: number; beatHz: number; carrierHz?: unknown } => {
      return typeof s === 'object' && s !== null && isNum(s.atSec) && s.atSec >= 0 && isNum(s.beatHz)
    })
    .map((s) => ({
      atSec: s.atSec,
      beatHz: clampTo(s.beatHz, RANGES.beatHz),
      ...(isNum(s.carrierHz) ? { carrierHz: clampTo(s.carrierHz, RANGES.carrierHz) } : {}),
    }))
    .sort((a, b) => a.atSec - b.atSec)
  if (steps.length === 0) return undefined
  return { name: typeof r.name === 'string' ? r.name.slice(0, MAX_NAME_LENGTH) : 'Programa', durationSec: r.durationSec, steps }
}

export function cleanPresetName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH)
}

/** Valida la lista guardada: descarta entradas inválidas y recorta rangos. */
export function sanitizeUserPresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Preset[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const r = item as { id?: unknown; name?: unknown; params?: unknown; program?: unknown; suggestedMinutes?: unknown }
    if (typeof r.id !== 'string' || r.id === '' || seen.has(r.id) || typeof r.name !== 'string') continue
    const name = cleanPresetName(r.name)
    if (!name || typeof r.params !== 'object' || r.params === null) continue
    seen.add(r.id)
    const program = sanitizeProgram(r.program)
    out.push({
      id: r.id,
      name,
      params: sanitizeParams(defaultParams(), r.params as Partial<Record<keyof EngineParams, unknown>>),
      ...(program ? { program } : {}),
      suggestedMinutes: sanitizeMinutes(r.suggestedMinutes),
    })
    if (out.length >= MAX_USER_PRESETS) break
  }
  return out
}

export function loadUserPresets(storage: StorageLike | null = browserStorage()): Preset[] {
  try {
    const text = storage?.getItem(PRESETS_KEY)
    return text ? sanitizeUserPresets(JSON.parse(text)) : []
  } catch {
    return []
  }
}

export function saveUserPresets(presets: Preset[], storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(PRESETS_KEY, JSON.stringify(presets))
  } catch {
    // sin almacenamiento disponible
  }
}

/** Banderas de «ya visto» (pantalla de primer uso, aviso isocrónico). */
export function readFlag(key: string, storage: StorageLike | null = browserStorage()): boolean {
  try {
    return storage?.getItem(key) === '1'
  } catch {
    return false
  }
}

export function writeFlag(key: string, storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(key, '1')
  } catch {
    // sin almacenamiento: se volverá a mostrar en la próxima visita
  }
}
