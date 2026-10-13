/**
 * Registro local de práctica (Bloque B, Fase 10): sesiones de respiración, racha, objetivo y CSV.
 * Solo localStorage, envuelto en try/catch. TypeScript puro, probado en Node.
 */
import type { StorageLike } from './storage'
import { RPM_MAX, RPM_MIN, RPM_STEP } from './breathing'

export const PRACTICE_KEY = 'binaural:practice:v1'
export const GOAL_KEY = 'binaural:goal:v1'
export const RESONANCE_KEY = 'binaural:resonance:v1'
export const MAX_PRACTICE_ENTRIES = 2000

export interface PracticeEntry {
  /** Fecha local AAAA-MM-DD. */
  date: string
  minutes: number
  rpm: number
  preset: string
}

/** Objetivo diario. Por defecto 2 sesiones de 20 min (protocolo clásico). */
export interface Goal {
  sessionsPerDay: number
  minutesPerSession: number
}

export const DEFAULT_GOAL: Goal = { sessionsPerDay: 2, minutesPerSession: 20 }

const pad = (n: number) => String(n).padStart(2, '0')

/** Fecha local AAAA-MM-DD (no UTC: la práctica se cuenta en el día del usuario). */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return localDate(new Date(y, m - 1, d + n))
}

/** Minutos practicados por día. */
export function minutesByDay(entries: readonly PracticeEntry[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of entries) out.set(e.date, (out.get(e.date) ?? 0) + e.minutes)
  return out
}

/** Siete días terminando hoy, de más antiguo a más reciente. */
export function lastWeek(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
}

/**
 * Racha: días seguidos con práctica, terminando hoy. Si hoy aún no hay práctica, la racha cuenta
 * desde ayer (así no se pierde a mitad de día).
 */
export function streak(entries: readonly PracticeEntry[], today: string): number {
  const days = minutesByDay(entries)
  let day = (days.get(today) ?? 0) > 0 ? today : addDays(today, -1)
  let n = 0
  while ((days.get(day) ?? 0) > 0) {
    n++
    day = addDays(day, -1)
  }
  return n
}

export const goalMinutes = (g: Goal): number => g.sessionsPerDay * g.minutesPerSession

/** CSV con cabecera; separador coma, punto decimal, sin BOM (abre bien en hojas de cálculo habituales). */
export function toCsv(entries: readonly PracticeEntry[]): string {
  const lines = ['fecha,minutos,rpm,preset']
  for (const e of entries) lines.push(`${e.date},${e.minutes},${e.rpm},"${e.preset.replace(/"/g, '""')}"`)
  return lines.join('\n') + '\n'
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null

/** Valida la lista guardada: descarta entradas incompletas o fuera de rango. */
export function sanitizePractice(raw: unknown): PracticeEntry[] {
  if (!Array.isArray(raw)) return []
  const out: PracticeEntry[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const r = item as Record<string, unknown>
    const minutes = num(r.minutes, 0, 600)
    const rpm = num(r.rpm, RPM_MIN, RPM_MAX)
    if (!isDate(r.date) || minutes === null || rpm === null) continue
    out.push({
      date: r.date,
      minutes: Math.round(minutes * 10) / 10,
      rpm,
      preset: typeof r.preset === 'string' ? r.preset.slice(0, 60) : 'Libre',
    })
    if (out.length >= MAX_PRACTICE_ENTRIES) break
  }
  return out
}

export function sanitizeGoal(raw: unknown): Goal {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const s = num(r.sessionsPerDay, 1, 10)
  const m = num(r.minutesPerSession, 1, 120)
  return {
    sessionsPerDay: s === null ? DEFAULT_GOAL.sessionsPerDay : Math.round(s),
    minutesPerSession: m === null ? DEFAULT_GOAL.minutesPerSession : Math.round(m),
  }
}

/** Frecuencia de resonancia guardada (4,0–7,0 en pasos de 0,5), o null si no hay. */
export function sanitizeResonance(raw: unknown): number | null {
  const v = num(raw, 4, 7)
  return v === null ? null : Math.round(v / RPM_STEP) * RPM_STEP
}

function read<T>(key: string, parse: (raw: unknown) => T, fallback: T, storage: StorageLike | null): T {
  try {
    const text = storage?.getItem(key)
    return text ? parse(JSON.parse(text)) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown, storage: StorageLike | null): void {
  try {
    storage?.setItem(key, JSON.stringify(value))
  } catch {
    // sin almacenamiento disponible: la app funciona igual
  }
}

export const loadPractice = (s: StorageLike | null = browserStore()) => read(PRACTICE_KEY, sanitizePractice, [], s)
export const savePractice = (e: PracticeEntry[], s: StorageLike | null = browserStore()) => write(PRACTICE_KEY, e, s)
export const loadGoal = (s: StorageLike | null = browserStore()) => read(GOAL_KEY, sanitizeGoal, DEFAULT_GOAL, s)
export const saveGoal = (g: Goal, s: StorageLike | null = browserStore()) => write(GOAL_KEY, g, s)
export const loadResonance = (s: StorageLike | null = browserStore()) => read(RESONANCE_KEY, sanitizeResonance, null, s)
export const saveResonance = (rpm: number, s: StorageLike | null = browserStore()) => write(RESONANCE_KEY, rpm, s)

function browserStore(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
