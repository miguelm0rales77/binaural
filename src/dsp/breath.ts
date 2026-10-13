/**
 * Reloj respiratorio (Bloque B, §B2 del plan). Función pura: dado un instante, devuelve la fase de la
 * respiración y la curva de llenado pulmonar. La usan el DspEngine (audio, con precisión de muestra)
 * y la interfaz (con el mismo tiempo), así que nunca se usan `setInterval` ni `Date.now()` para el ritmo.
 *
 * La frecuencia instantánea se integra (igual que el acumulador de fase del oscilador), así que la rampa
 * de entrada no produce saltos. Sin rampa, el resultado es el de un período fijo.
 */

export type BreathPhase = 'in' | 'holdIn' | 'out' | 'holdOut'

export interface BreathPattern {
  /** Respiraciones por minuto. Resonancia: 4,0–7,0; personalizado: 3–12. */
  rpm: number
  /** Fracción del tiempo de respiración (sin retenciones) dedicada a inspirar. 0,2–0,8; por defecto 0,4 (los controles de resonancia usan 0,3–0,5). */
  inhaleRatio: number
  holdInSec: number
  holdOutSec: number
  /** Frecuencia de inicio de la rampa (por defecto 8 rpm). */
  rampFromRpm?: number
  /** Duración de la rampa hasta `rpm` (por defecto 0 = sin rampa; el preset por defecto usa 120 s). */
  rampSec?: number
}

export interface BreathState {
  phase: BreathPhase
  /** 0–1 dentro de la fase actual. */
  phaseProgress: number
  /** Duración completa de la fase actual (s); con `phaseProgress` da la cuenta atrás. */
  phaseSec: number
  /** Llenado pulmonar 0–1: 0 con los pulmones vacíos, 1 llenos. Continuo en todas las fases. */
  lung: number
  /** Número de ciclos completados desde el inicio (el primero es el 0). */
  cycleIndex: number
}

/** Patrón por defecto (§B2): 6 rpm, inspiración 4 s y espiración 6 s, sin retenciones, con rampa de 8 a 6 rpm en 2 min. */
export const DEFAULT_BREATH_PATTERN: BreathPattern = {
  rpm: 6,
  inhaleRatio: 0.4,
  holdInSec: 0,
  holdOutSec: 0,
  rampFromRpm: 8,
  rampSec: 120,
}

const PHASE_INDEX: Record<BreathPhase, number> = { in: 0, holdIn: 1, out: 2, holdOut: 3 }

/** Índice 0–3 de la fase (para detectar cambios de fase sin comparar cadenas en el hilo de audio). */
export const phaseIndex = (phase: BreathPhase): number => PHASE_INDEX[phase]

/** Ciclos completados en el instante `t` (integral de rpm/60). */
function cyclesAt(t: number, p: BreathPattern): number {
  const r1 = p.rpm
  const R = p.rampSec ?? 0
  if (R <= 0) return (r1 * t) / 60
  const r0 = p.rampFromRpm ?? 8
  if (t <= R) return (r0 * t + ((r1 - r0) * t * t) / (2 * R)) / 60
  return (((r0 + r1) * R) / 2 + r1 * (t - R)) / 60
}

/** Instante en el que empieza el ciclo `n` (inversa de `cyclesAt`, en forma cerrada). */
function cycleStart(n: number, p: BreathPattern): number {
  const r1 = p.rpm
  const R = p.rampSec ?? 0
  if (R <= 0) return (n * 60) / r1
  const r0 = p.rampFromRpm ?? 8
  const cyclesAtRampEnd = ((r0 + r1) * R) / 120
  if (n > cyclesAtRampEnd) return R + ((n - cyclesAtRampEnd) * 60) / r1
  // cyclesAt(t) = b·t + a·t² dentro de la rampa; se resuelve con la forma estable 2n / (b + √(b² + 4an)).
  const a = (r1 - r0) / (120 * R)
  const b = r0 / 60
  return (2 * n) / (b + Math.sqrt(b * b + 4 * a * n))
}

/**
 * Estado de la respiración en el instante `tSec` (segundos desde el inicio), escrito en `out`.
 * Sin reservar memoria: el DspEngine lo llama muestra a muestra con un único objeto.
 */
export function breathStateInto(out: BreathState, tSec: number, p: BreathPattern): BreathState {
  const t = tSec > 0 ? tSec : 0
  const n = Math.floor(cyclesAt(t, p) + 1e-9)
  const t0 = cycleStart(n, p)
  const T = cycleStart(n + 1, p) - t0
  const tau = Math.min(Math.max(t - t0, 0), T)

  // Las retenciones son tiempos fijos, pero nunca pueden ocupar más del 80 % del ciclo.
  let hIn = p.holdInSec
  let hOut = p.holdOutSec
  const sum = hIn + hOut
  const maxHold = 0.8 * T
  if (sum > maxHold) {
    const k = maxHold / sum
    hIn *= k
    hOut *= k
  }
  const breathing = T - hIn - hOut
  const ti = p.inhaleRatio * breathing
  const te = breathing - ti

  out.cycleIndex = n
  if (tau < ti) {
    const x = tau / ti
    out.phase = 'in'
    out.phaseProgress = x
    out.phaseSec = ti
    out.lung = 0.5 - 0.5 * Math.cos(Math.PI * x)
  } else if (tau < ti + hIn) {
    out.phase = 'holdIn'
    out.phaseProgress = (tau - ti) / hIn
    out.phaseSec = hIn
    out.lung = 1
  } else if (tau < ti + hIn + te) {
    const x = (tau - ti - hIn) / te
    out.phase = 'out'
    out.phaseProgress = x
    out.phaseSec = te
    out.lung = 0.5 + 0.5 * Math.cos(Math.PI * x)
  } else {
    out.phase = 'holdOut'
    out.phaseProgress = hOut > 0 ? Math.min(1, (tau - ti - hIn - te) / hOut) : 0
    out.phaseSec = hOut
    out.lung = 0
  }
  return out
}

/** Versión que devuelve un objeto nuevo (para la interfaz y los tests). */
export function breathState(tSec: number, p: BreathPattern): BreathState {
  return breathStateInto({ phase: 'in', phaseProgress: 0, phaseSec: 0, lung: 0, cycleIndex: 0 }, tSec, p)
}

const clampNum = (v: unknown, fallback: number, lo: number, hi: number): number => {
  const x = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.max(lo, Math.min(hi, x))
}

/**
 * Valida un patrón completo (p. ej. uno guardado o llegado por `setParams`), recortando rangos y descartando
 * valores erróneos. Un patrón es un todo: los campos ausentes toman valores neutros (sin rampa ni retenciones),
 * no los del patrón anterior. Así, quitar la rampa es pasar `rampSec: 0` o no pasarlo.
 */
export function sanitizeBreathPattern(patch: unknown): BreathPattern {
  const p = (patch && typeof patch === 'object' ? patch : {}) as Partial<Record<keyof BreathPattern, unknown>>
  return {
    rpm: clampNum(p.rpm, 6, 3, 12),
    inhaleRatio: clampNum(p.inhaleRatio, 0.4, 0.2, 0.8),
    holdInSec: clampNum(p.holdInSec, 0, 0, 10),
    holdOutSec: clampNum(p.holdOutSec, 0, 0, 10),
    rampFromRpm: clampNum(p.rampFromRpm, 8, 3, 12),
    rampSec: clampNum(p.rampSec, 0, 0, 600),
  }
}
