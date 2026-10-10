import { defaultParams, sanitizeParams } from './dsp/params'
import type { EngineParams } from './dsp/types'

export const STORAGE_KEY = 'binaural:state:v1'
export const TIMER_OPTIONS_MIN = [15, 30, 45, 60, 90] as const

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
  const timerMin = (TIMER_OPTIONS_MIN as readonly unknown[]).includes(r.timerMin)
    ? (r.timerMin as number)
    : null
  return { params, timerMin }
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
