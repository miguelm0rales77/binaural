/**
 * «Mi frecuencia» (§B5, Fase 10): prueba escalonada sin sensor. Cada escalón dura 2 min de respiración
 * guiada y va seguido de 1 min de respiración libre, en la que la persona puntúa la comodidad (1–5)
 * y si le ha faltado el aire. Sin sensor de pulso esto es una aproximación por comodidad.
 */

/** Ritmos de la prueba, de más rápido a más lento (§B5). */
export const RESONANCE_STEPS = [6.5, 6.0, 5.5, 5.0, 4.5] as const
export const STEP_SEC = 120
export const REST_SEC = 60
/** Duración total aproximada si se puntúa a tiempo: 5 escalones de 2 min y 4 descansos de 1 min. */
export const TEST_TOTAL_SEC = RESONANCE_STEPS.length * STEP_SEC + (RESONANCE_STEPS.length - 1) * REST_SEC

export interface StepScore {
  rpm: number
  /** Comodidad de 1 (incómodo) a 5 (muy cómodo). */
  comfort: 1 | 2 | 3 | 4 | 5
  shortOfBreath: boolean
}

/**
 * Frecuencia recomendada: la de mayor comodidad entre las que no dejaron falta de aire. Si todas dejaron
 * falta de aire, se elige entre todas. En caso de empate, gana el ritmo más alto de la prueba (el primero
 * en la secuencia). Devuelve null si no hay puntuaciones.
 */
export function recommend(scores: readonly StepScore[]): number | null {
  if (scores.length === 0) return null
  const pool = scores.some((s) => !s.shortOfBreath) ? scores.filter((s) => !s.shortOfBreath) : [...scores]
  let best: StepScore | null = null
  for (const s of pool) {
    if (best === null || s.comfort > best.comfort || (s.comfort === best.comfort && s.rpm > best.rpm)) best = s
  }
  return best?.rpm ?? null
}

/** Escalón en el que está la prueba `elapsedSec` segundos después de empezar, o null si ya terminó. */
export function stepAt(elapsedSec: number): { index: number; rpm: number; inStep: boolean } | null {
  let t = 0
  for (let i = 0; i < RESONANCE_STEPS.length; i++) {
    const step = RESONANCE_STEPS[i] as number
    if (elapsedSec < t + STEP_SEC) return { index: i, rpm: step, inStep: true }
    t += STEP_SEC
    if (i < RESONANCE_STEPS.length - 1) {
      if (elapsedSec < t + REST_SEC) return { index: i, rpm: step, inStep: false }
      t += REST_SEC
    }
  }
  return null
}

/** ¿Ha terminado el escalón de respiración guiada? `stepElapsedSec` se mide desde el inicio del escalón. */
export function stepDone(stepElapsedSec: number): boolean {
  return stepElapsedSec >= STEP_SEC
}

/**
 * Qué hacer en el descanso: esperar, pasar al siguiente escalón o terminar la prueba.
 * Hace falta haber puntuado el escalón. Tras un escalón intermedio, hay que esperar el minuto de descanso.
 * Tras el último escalón no hay descanso: basta con puntuarlo.
 */
export function afterRest(index: number, restElapsedSec: number, submitted: boolean): 'wait' | 'next' | 'finish' {
  if (!submitted) return 'wait'
  if (index === RESONANCE_STEPS.length - 1) return 'finish'
  return restElapsedSec >= REST_SEC ? 'next' : 'wait'
}
