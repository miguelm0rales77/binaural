/**
 * Máquina de estados de la sesión de meditación bilateral. Funciones puras: sin audio ni DOM.
 *
 *   preparación → calibración → meditación ⇄ pausa («Calma») → cierre → registro → preparación
 *
 * «Salir» pasa a cierre desde cualquier fase activa. Un malestar de 8 o más lleva a «Calma» de inmediato (con el
 * corte rápido del paneo) y no se reanuda hasta que la persona baje la marca por debajo de 8.
 */
import type { BilateralMode } from '../dsp/bilateral'

export type Phase = 'preparacion' | 'calibracion' | 'meditacion' | 'pausa' | 'cierre' | 'registro'
export type EndReason = 'usuario' | 'duracion' | 'limite'
export type EarState = 'pendiente' | 'oida' | 'no-oida'

/** Límite duro de la sesión completa (calibración incluida), en segundos. */
export const HARD_LIMIT_SEC = 30 * 60
/** Duración planeada: por defecto 15 min (ajustable, no validada) y como máximo el límite duro. */
export const PLANNED_MIN = { min: 5, max: 30, default: 15 } as const
/** Malestar que detiene la alternancia y lleva a «Calma». */
export const ALERT_LEVEL = 8

export interface SessionState {
  phase: Phase
  /** Modo de la sesión: elegido por la persona o asignado al azar si el modo ciego está activo. */
  mode: BilateralMode
  blind: boolean
  plannedSec: number
  /** Tiempo de la sesión (del motor) en el que empezó la calibración. */
  startSec: number
  /** Tiempo del motor en el que empezó la meditación (tras la calibración). */
  medStartSec: number
  elapsedSec: number
  /** Última marca de malestar (0–10), o null si no se ha marcado. */
  discomfort: number | null
  alert: boolean
  ears: { left: EarState; right: EarState }
  endReason: EndReason | null
}

export const INITIAL_SESSION: SessionState = {
  phase: 'preparacion',
  mode: 'continuous',
  blind: false,
  plannedSec: PLANNED_MIN.default * 60,
  startSec: 0,
  medStartSec: 0,
  elapsedSec: 0,
  discomfort: null,
  alert: false,
  ears: { left: 'pendiente', right: 'pendiente' },
  endReason: null,
}

export type SessionEvent =
  | { type: 'begin'; mode: BilateralMode; blind: boolean; plannedMin: number }
  | { type: 'ear'; side: 'left' | 'right'; heard: boolean }
  | { type: 'retry' }
  | { type: 'rate'; value: number }
  | { type: 'calma' }
  | { type: 'resume' }
  | { type: 'salir' }
  | { type: 'tick'; elapsedSec: number }
  | { type: 'continue' }
  | { type: 'finish' }

const ACTIVE: readonly Phase[] = ['calibracion', 'meditacion', 'pausa']

export const isActive = (phase: Phase): boolean => ACTIVE.includes(phase)

const clampScale = (v: number) => Math.max(0, Math.min(10, Math.round(v)))

/** Función de transición: devuelve el estado nuevo (o el mismo si el evento no aplica en esta fase). */
export function reduce(s: SessionState, e: SessionEvent): SessionState {
  switch (e.type) {
    case 'begin': {
      if (s.phase !== 'preparacion') return s
      const plannedMin = Math.max(PLANNED_MIN.min, Math.min(PLANNED_MIN.max, Math.round(e.plannedMin)))
      return {
        ...INITIAL_SESSION,
        phase: 'calibracion',
        mode: e.mode,
        blind: e.blind,
        plannedSec: plannedMin * 60,
        startSec: s.elapsedSec,
        medStartSec: s.elapsedSec,
        elapsedSec: s.elapsedSec,
      }
    }
    case 'ear': {
      if (s.phase !== 'calibracion') return s
      const ears = { ...s.ears, [e.side]: e.heard ? 'oida' : 'no-oida' } as SessionState['ears']
      if (ears.left === 'oida' && ears.right === 'oida') {
        return { ...s, ears, phase: 'meditacion', medStartSec: s.elapsedSec }
      }
      return { ...s, ears }
    }
    case 'retry':
      if (s.phase !== 'calibracion') return s
      return { ...s, ears: { left: 'pendiente', right: 'pendiente' } }
    case 'rate': {
      if (s.phase !== 'meditacion' && s.phase !== 'pausa') return s
      const value = clampScale(e.value)
      const high = value >= ALERT_LEVEL
      if (s.phase === 'meditacion' && high) return { ...s, discomfort: value, phase: 'pausa', alert: true }
      if (s.phase === 'pausa') return { ...s, discomfort: value, alert: high }
      return { ...s, discomfort: value }
    }
    case 'calma':
      if (s.phase !== 'meditacion') return s
      return { ...s, phase: 'pausa' }
    case 'resume': {
      if (s.phase !== 'pausa') return s
      // No se vuelve a la alternancia con el malestar alto: hace falta bajar la marca primero.
      if (s.discomfort !== null && s.discomfort >= ALERT_LEVEL) return s
      return { ...s, phase: 'meditacion', alert: false }
    }
    case 'salir':
      if (!isActive(s.phase)) return s
      return { ...s, phase: 'cierre', endReason: 'usuario' }
    case 'tick': {
      const elapsedSec = e.elapsedSec
      const next = { ...s, elapsedSec }
      if (!isActive(s.phase)) return next
      if (elapsedSec - s.startSec >= HARD_LIMIT_SEC) return { ...next, phase: 'cierre', endReason: 'limite' }
      if (s.phase !== 'calibracion' && elapsedSec - s.medStartSec >= s.plannedSec) {
        return { ...next, phase: 'cierre', endReason: 'duracion' }
      }
      return next
    }
    case 'continue':
      if (s.phase !== 'cierre') return s
      return { ...s, phase: 'registro' }
    case 'finish':
      if (s.phase !== 'registro') return s
      return { ...INITIAL_SESSION, elapsedSec: s.elapsedSec }
  }
}

/**
 * Modo que se puede mostrar. Con el modo ciego activo, no se muestra hasta el registro, al terminar la sesión.
 */
export function visibleMode(s: Pick<SessionState, 'mode' | 'blind' | 'phase'>): BilateralMode | null {
  if (s.blind && s.phase !== 'registro') return null
  return s.mode
}

/** Asigna un modo al azar (uniforme). `rand` devuelve valores en [0, 1). */
export function pickMode(rand: () => number, modes: readonly BilateralMode[]): BilateralMode {
  const i = Math.min(modes.length - 1, Math.floor(rand() * modes.length))
  return modes[i] as BilateralMode
}

export interface GuideStep {
  text: string
  sec: number
}

/**
 * Paso de la guía en el instante `t` (s desde el inicio de la meditación). La guía repite sus pasos en bucle.
 * Devuelve el índice del paso y lo que queda de él.
 */
export function guideAt(t: number, steps: readonly GuideStep[]): { index: number; remainingSec: number } {
  const total = steps.reduce((a, s) => a + s.sec, 0)
  if (steps.length === 0 || total <= 0) return { index: 0, remainingSec: 0 }
  let x = ((t % total) + total) % total
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] as GuideStep
    if (x < step.sec) return { index: i, remainingSec: step.sec - x }
    x -= step.sec
  }
  return { index: steps.length - 1, remainingSec: 0 }
}
