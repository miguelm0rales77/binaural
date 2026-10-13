/**
 * Registro de práctica (§B5, Fase 10): sesiones de respiración guardadas en el propio dispositivo.
 * Sin notificaciones, sin cuentas y sin envío de datos. Todo pasa por try/catch: si el almacenamiento
 * no está disponible, el registro simplemente no se guarda.
 */
import type { StorageLike } from './storage'

export const PRACTICE_KEY = 'binaural:practice:v1'
export const PRACTICE_GOAL_KEY = 'binaural:practice-goal:v1'
export const RESONANCE_KEY = 'binaural:resonance-rpm:v1'
/** Objetivo por defecto: 2 × 20 min al día, como en el protocolo clásico. */
export const DEFAULT_GOAL_MIN = 40
export const GOAL_RANGE_MIN = { min: 5, max: 240 } as const
export const MAX_ENTRIES = 5000
const MAX_PRESET_LENGTH = 40

export interface PracticeEntry {
  /** Fecha local de la sesión, AAAA-MM-DD. */
  date: string
  seconds: number
  rpm: number
  /** Nombre del preset de respiración con el que se hizo (o «Personalizado»). */
  preset: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Fecha local (no UTC) en formato AAAA-MM-DD: el día del usuario, no el del meridiano de Greenwich. */
export function localDate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const browserStorage = (): StorageLike | null => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Valida entradas leídas del almacenamiento: descarta lo que no encaja y limita el tamaño. */
export function sanitizeEntries(raw: unknown): PracticeEntry[] {
  if (!Array.isArray(raw)) return []
  const out: PracticeEntry[] = []
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue
    const e = r as Record<string, unknown>
    const ok =
      typeof e.date === 'string' &&
      DATE_RE.test(e.date) &&
      typeof e.seconds === 'number' &&
      Number.isFinite(e.seconds) &&
      e.seconds >= 0 &&
      e.seconds <= 86400 &&
      typeof e.rpm === 'number' &&
      Number.isFinite(e.rpm) &&
      e.rpm >= 1 &&
      e.rpm <= 30 &&
      typeof e.preset === 'string'
    if (ok) {
      out.push({
        date: e.date as string,
        seconds: e.seconds as number,
        rpm: e.rpm as number,
        preset: (e.preset as string).slice(0, MAX_PRESET_LENGTH),
      })
    }
  }
  return out.slice(-MAX_ENTRIES)
}

export function loadPractice(storage: StorageLike | null = browserStorage()): PracticeEntry[] {
  try {
    const text = storage?.getItem(PRACTICE_KEY)
    return text ? sanitizeEntries(JSON.parse(text)) : []
  } catch {
    return []
  }
}

export function savePractice(list: PracticeEntry[], storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(PRACTICE_KEY, JSON.stringify(list.slice(-MAX_ENTRIES)))
  } catch {
    // cuota llena o almacenamiento bloqueado: la app sigue funcionando sin registro persistente
  }
}

export function loadGoal(storage: StorageLike | null = browserStorage()): number {
  try {
    const v = Number(storage?.getItem(PRACTICE_GOAL_KEY))
    return Number.isFinite(v) && v >= GOAL_RANGE_MIN.min && v <= GOAL_RANGE_MIN.max ? Math.round(v) : DEFAULT_GOAL_MIN
  } catch {
    return DEFAULT_GOAL_MIN
  }
}

export function saveGoal(min: number, storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(PRACTICE_GOAL_KEY, String(Math.round(min)))
  } catch {
    // sin almacenamiento, el objetivo vuelve al valor por defecto al recargar
  }
}

/** Frecuencia de resonancia elegida con «Mi frecuencia», o null si todavía no se ha hecho la prueba. */
export function loadResonance(storage: StorageLike | null = browserStorage()): number | null {
  try {
    const text = storage?.getItem(RESONANCE_KEY)
    if (text === null || text === undefined) return null
    const v = Number(text)
    return Number.isFinite(v) && v >= 1 && v <= 30 ? Math.round(v * 10) / 10 : null
  } catch {
    return null
  }
}

export function saveResonance(rpm: number, storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(RESONANCE_KEY, String(rpm))
  } catch {
    // sin almacenamiento, la frecuencia vuelve a 6 rpm al recargar
  }
}

/** Fecha de hace `n` días respecto a `date` (AAAA-MM-DD), en el calendario local. */
export function shiftDate(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return localDate(new Date(y, m - 1, d - n))
}

/** Los `n` días que terminan en `today`, del más antiguo al más reciente. */
export function lastDays(today: string, n = 7): string[] {
  return Array.from({ length: n }, (_, k) => shiftDate(today, n - 1 - k))
}

/** Minutos practicados en un día (con decimales). */
export function minutesOn(entries: readonly PracticeEntry[], date: string): number {
  return entries.reduce((sum, e) => (e.date === date ? sum + e.seconds / 60 : sum), 0)
}

/**
 * Racha: días seguidos con al menos una sesión, contando hacia atrás desde hoy.
 * Si hoy todavía no hay sesión, la racha se cuenta desde ayer (hoy aún no ha terminado).
 */
export function streak(entries: readonly PracticeEntry[], today: string): number {
  const days = new Set(entries.map((e) => e.date))
  let day = days.has(today) ? today : shiftDate(today, 1)
  let count = 0
  while (days.has(day)) {
    count++
    day = shiftDate(day, 1)
  }
  return count
}

/** CSV con cabecera; el separador es la coma y los decimales llevan punto (formato estándar). */
export function toCsv(entries: readonly PracticeEntry[]): string {
  const header = 'fecha,segundos,minutos,rpm,preset'
  const rows = entries.map((e) => {
    const preset = e.preset.includes(',') || e.preset.includes('"') ? `"${e.preset.replace(/"/g, '""')}"` : e.preset
    return [e.date, Math.round(e.seconds), (e.seconds / 60).toFixed(2), e.rpm.toFixed(1), preset].join(',')
  })
  return [header, ...rows].join('\n') + '\n'
}
