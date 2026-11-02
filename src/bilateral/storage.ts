/**
 * Persistencia local de la meditación bilateral: configuración y registro, solo en este dispositivo.
 * Todas las claves empiezan por `BILATERAL_PREFIX`, así «borrar todo» no toca el resto de la aplicación.
 */
import { BED_TYPES, BILATERAL_MODES, BILATERAL_RANGES, type BedType, type BilateralMode } from '../dsp/bilateral'
import type { EndReason } from './session'
import { PLANNED_MIN } from './session'

export const BILATERAL_PREFIX = 'binaural:bilateral'
export const CONFIG_KEY = `${BILATERAL_PREFIX}-config:v1`
export const LOG_KEY = `${BILATERAL_PREFIX}-log:v1`
export const MAX_LOG_ENTRIES = 2000
export const MAX_NOTE_LENGTH = 500

export interface BilateralConfig {
  mode: BilateralMode
  blind: boolean
  plannedMin: number
  lfoHz: number
  bgBinaural: boolean
  bgBeatHz: number
  bed: BedType
  haptics: boolean
}

export const DEFAULT_CONFIG: BilateralConfig = {
  mode: 'continuous',
  blind: false,
  plannedMin: PLANNED_MIN.default,
  lfoHz: 0.5,
  bgBinaural: false,
  bgBeatHz: 6,
  bed: 'rain',
  haptics: false,
}

export interface LogEntry {
  id: string
  /** Fecha local AAAA-MM-DD. */
  date: string
  durationSec: number
  endReason: EndReason
  mode: BilateralMode
  blind: boolean
  lfoHz: number
  calma: number | null
  atencion: number | null
  activacion: number | null
  malestar: number | null
  nota: string
}

/** Mínimo de Storage que necesitamos (permite un almacenamiento falso en los tests). */
export interface BilateralStorage {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const num = (v: unknown, min: number, max: number, fb: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fb

const pick = <T extends string>(v: unknown, list: readonly T[], fb: T): T => (list.includes(v as T) ? (v as T) : fb)

/** Configuración válida a partir de cualquier valor guardado. */
export function sanitizeConfig(raw: unknown): BilateralConfig {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_CONFIG
  return {
    mode: pick(r.mode, BILATERAL_MODES, d.mode),
    blind: typeof r.blind === 'boolean' ? r.blind : d.blind,
    plannedMin: Math.round(num(r.plannedMin, PLANNED_MIN.min, PLANNED_MIN.max, d.plannedMin)),
    lfoHz: num(r.lfoHz, BILATERAL_RANGES.lfoHz.min, BILATERAL_RANGES.lfoHz.max, d.lfoHz),
    bgBinaural: typeof r.bgBinaural === 'boolean' ? r.bgBinaural : d.bgBinaural,
    bgBeatHz: num(r.bgBeatHz, BILATERAL_RANGES.bgBeatHz.min, BILATERAL_RANGES.bgBeatHz.max, d.bgBeatHz),
    bed: pick(r.bed, BED_TYPES, d.bed),
    haptics: typeof r.haptics === 'boolean' ? r.haptics : d.haptics,
  }
}

const scale = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10 ? v : null)

/** Registro válido: descarta entradas mal formadas y recorta textos largos. */
export function sanitizeLog(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return []
  const out: LogEntry[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const r = item as Record<string, unknown>
    if (typeof r.id !== 'string' || typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue
    if (typeof r.durationSec !== 'number' || !Number.isFinite(r.durationSec) || r.durationSec < 0) continue
    out.push({
      id: r.id,
      date: r.date,
      durationSec: Math.round(r.durationSec),
      endReason: pick(r.endReason, ['usuario', 'duracion', 'limite'] as const, 'usuario'),
      mode: pick(r.mode, BILATERAL_MODES, 'continuous'),
      blind: r.blind === true,
      lfoHz: num(r.lfoHz, 0, 10, 0),
      calma: scale(r.calma),
      atencion: scale(r.atencion),
      activacion: scale(r.activacion),
      malestar: scale(r.malestar),
      nota: typeof r.nota === 'string' ? r.nota.slice(0, MAX_NOTE_LENGTH) : '',
    })
    if (out.length >= MAX_LOG_ENTRIES) break
  }
  return out
}

function parse(storage: BilateralStorage | null, key: string): unknown {
  try {
    const text = storage?.getItem(key)
    return text ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}

export function loadConfig(storage: BilateralStorage | null = browserStorage()): BilateralConfig {
  return sanitizeConfig(parse(storage, CONFIG_KEY))
}

export function saveConfig(config: BilateralConfig, storage: BilateralStorage | null = browserStorage()): void {
  try {
    storage?.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch {
    // cuota llena o sin almacenamiento: la sesión funciona igual
  }
}

export function loadLog(storage: BilateralStorage | null = browserStorage()): LogEntry[] {
  return sanitizeLog(parse(storage, LOG_KEY))
}

export function saveLog(entries: LogEntry[], storage: BilateralStorage | null = browserStorage()): void {
  try {
    storage?.setItem(LOG_KEY, JSON.stringify(entries.slice(-MAX_LOG_ENTRIES)))
  } catch {
    // sin almacenamiento disponible
  }
}

/** Borra todas las claves de la meditación bilateral (configuración, registro y lo que se añada con el prefijo). */
export function clearBilateralData(storage: BilateralStorage | null = browserStorage()): number {
  if (!storage) return 0
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k !== null && k.startsWith(BILATERAL_PREFIX)) keys.push(k)
  }
  for (const k of keys) storage.removeItem(k)
  return keys.length
}

function browserStorage(): BilateralStorage | null {
  try {
    return window.localStorage
  } catch {
    return null // modo privado o datos bloqueados
  }
}
