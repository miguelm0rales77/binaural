/**
 * Reloj respiratorio (Bloque B). Función pura del tiempo: la usan el motor (hilo de audio, muestra a
 * muestra), la exportación y la interfaz, así que todos ven el mismo ritmo.
 *
 * Modelo: la fase del ciclo es la integral de la frecuencia instantánea (rpm/60). Con rampa lineal
 * la integral tiene forma cerrada, así que no hay saltos al cambiar de frecuencia. Dentro de cada
 * ciclo, la parte respiratoria ocupa `1 − holdIn − holdOut` (las retenciones se dan en segundos al
 * ritmo actual) y se reparte según `inhaleRatio`.
 */

export type BreathPhase = 'in' | 'holdIn' | 'out' | 'holdOut'

export interface BreathPattern {
  /** Respiraciones por minuto del ciclo objetivo. */
  rpm: number
  /** Fracción de la parte respiratoria del ciclo dedicada a inspirar (0.2–0.8). */
  inhaleRatio: number
  holdInSec: number
  holdOutSec: number
  /** Si está definido, el ritmo empieza aquí y baja (o sube) linealmente hasta `rpm` en `rampSec`. */
  rampFromRpm?: number
  /** Duración de la rampa en segundos (120 por defecto cuando hay `rampFromRpm`). */
  rampSec?: number
}

export interface BreathState {
  phase: BreathPhase
  /** Progreso dentro de la fase actual, 0–1. */
  phaseProgress: number
  /** Llenado de los pulmones: 0 = vacíos, 1 = llenos. Curva coseno, continua. */
  lung: number
  /** Número de ciclo completo desde el inicio del reloj. */
  cycleIndex: number
}

export const RESONANCE_PATTERN: BreathPattern = { rpm: 6, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0 }
export const DEFAULT_RAMP_FROM_RPM = 8
export const DEFAULT_RAMP_SEC = 120

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const finite = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback)

/** Ajusta un patrón a rangos seguros y rellena los valores por defecto. */
export function sanitizePattern(p: BreathPattern): BreathPattern {
  const out: BreathPattern = {
    rpm: clamp(finite(p.rpm, RESONANCE_PATTERN.rpm), 3, 12),
    inhaleRatio: clamp(finite(p.inhaleRatio, RESONANCE_PATTERN.inhaleRatio), 0.2, 0.8),
    holdInSec: clamp(finite(p.holdInSec, 0), 0, 20),
    holdOutSec: clamp(finite(p.holdOutSec, 0), 0, 20),
  }
  if (p.rampFromRpm !== undefined) {
    out.rampFromRpm = clamp(finite(p.rampFromRpm, DEFAULT_RAMP_FROM_RPM), 3, 12)
    out.rampSec = clamp(finite(p.rampSec, DEFAULT_RAMP_SEC), 10, 600)
  }
  return out
}

/** Rampa efectiva, o null si el patrón no tiene rampa (o la rampa no cambia nada). */
function rampOf(p: BreathPattern): { from: number; sec: number } | null {
  if (p.rampFromRpm === undefined || p.rampFromRpm === p.rpm) return null
  return { from: p.rampFromRpm, sec: p.rampSec ?? DEFAULT_RAMP_SEC }
}

/** Frecuencia instantánea en rpm en el instante `t` (segundos desde el inicio del reloj). */
export function rpmAt(t: number, p: BreathPattern): number {
  const r = rampOf(p)
  if (!r || t >= r.sec) return p.rpm
  return r.from + ((p.rpm - r.from) * Math.max(0, t)) / r.sec
}

/** Ciclos completos transcurridos (fase continua): integral de rpm/60 desde 0 hasta `t`. */
export function cyclesAt(t: number, p: BreathPattern): number {
  const tt = Math.max(0, t)
  const r = rampOf(p)
  if (!r) return (p.rpm * tt) / 60
  const r1 = p.rpm
  if (tt < r.sec) return (r.from * tt + ((r1 - r.from) * tt * tt) / (2 * r.sec)) / 60
  const atEnd = ((r.from + r1) * r.sec) / 120
  return (atEnd + (r1 * (tt - r.sec)) / 60)
}

/**
 * Estado del reloj en `t`, escrito en `out` (sin reservar memoria: lo usa el motor en cada muestra).
 * Inspiración: lung = 0.5 − 0.5·cos(πp); espiración: 0.5 + 0.5·cos(πp); retenciones: constante.
 */
export function breathStateInto(out: BreathState, t: number, p: BreathPattern): BreathState {
  const theta = cyclesAt(t, p)
  const k = Math.floor(theta)
  const c = theta - k
  const rate = rpmAt(t, p) / 60

  let hIn = p.holdInSec * rate
  let hOut = p.holdOutSec * rate
  const holds = hIn + hOut
  if (holds > 0.8) {
    hIn *= 0.8 / holds
    hOut *= 0.8 / holds
  }
  const b = 1 - hIn - hOut // parte respiratoria del ciclo
  const ratio = clamp(p.inhaleRatio, 0.2, 0.8)
  const a1 = ratio * b // fin de la inspiración
  const a2 = a1 + hIn // fin de la retención de inspiración
  const a3 = a2 + (1 - ratio) * b // fin de la espiración

  out.cycleIndex = k
  if (c < a1) {
    const q = c / a1
    out.phase = 'in'
    out.phaseProgress = q
    out.lung = 0.5 - 0.5 * Math.cos(Math.PI * q)
  } else if (c < a2) {
    out.phase = 'holdIn'
    out.phaseProgress = clamp((c - a1) / hIn, 0, 1)
    out.lung = 1
  } else if (c < a3) {
    const q = (c - a2) / ((1 - ratio) * b)
    out.phase = 'out'
    out.phaseProgress = clamp(q, 0, 1)
    out.lung = 0.5 + 0.5 * Math.cos(Math.PI * clamp(q, 0, 1))
  } else {
    out.phase = 'holdOut'
    out.phaseProgress = hOut > 0 ? clamp((c - a3) / hOut, 0, 1) : 1
    out.lung = 0
  }
  return out
}

/** Versión que reserva un objeto (para tests, interfaz y exportación; el motor usa `breathStateInto`). */
export function breathState(t: number, p: BreathPattern): BreathState {
  return breathStateInto({ phase: 'in', phaseProgress: 0, lung: 0, cycleIndex: 0 }, t, p)
}

/** Duración de un ciclo completo (s) al ritmo objetivo, sin rampa. */
export function cyclePeriodSec(p: BreathPattern): number {
  return 60 / p.rpm
}

/**
 * Duración (s) de la fase `phase` al ritmo del instante `t` (coherente con `breathStateInto`).
 * La interfaz la usa para la cuenta atrás.
 */
export function phaseLengthSec(phase: BreathPhase, t: number, p: BreathPattern): number {
  const rate = rpmAt(t, p) / 60
  const period = 1 / rate
  let hIn = p.holdInSec * rate
  let hOut = p.holdOutSec * rate
  const holds = hIn + hOut
  if (holds > 0.8) {
    hIn *= 0.8 / holds
    hOut *= 0.8 / holds
  }
  const b = 1 - hIn - hOut
  const ratio = clamp(p.inhaleRatio, 0.2, 0.8)
  switch (phase) {
    case 'in':
      return ratio * b * period
    case 'holdIn':
      return hIn * period
    case 'out':
      return (1 - ratio) * b * period
    case 'holdOut':
      return hOut * period
  }
}
