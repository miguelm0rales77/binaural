/**
 * «Mi frecuencia» sin sensor (Bloque B, Fase 10): prueba escalonada de comodidad.
 * Sin pulso medido, esto es una aproximación por comodidad; la frecuencia de resonancia precisa
 * requiere medir la frecuencia cardíaca (Bloque D).
 */
export const RESONANCE_STEPS = [6.5, 6.0, 5.5, 5.0, 4.5] as const
export const STEP_SEC = 120 // 2 min respirando con la guía
export const REST_SEC = 60 // 1 min de respiración libre entre escalones
export const TEST_TOTAL_SEC = RESONANCE_STEPS.length * (STEP_SEC + REST_SEC) - REST_SEC // 14 min

export interface StepRating {
  rpm: number
  /** Comodidad de 1 (muy incómodo) a 5 (muy cómodo); null si no se puntuó. */
  comfort: number | null
  /** Ha notado falta de aire. */
  airHunger: boolean | null
}

export type TestStep = { kind: 'breath'; index: number } | { kind: 'rest'; index: number } | { kind: 'done' }

/** Qué toca en el instante `t` (segundos desde el inicio de la prueba). */
export function stepAt(t: number): TestStep {
  if (t < 0) return { kind: 'breath', index: 0 }
  const period = STEP_SEC + REST_SEC
  const index = Math.floor(t / period)
  if (index >= RESONANCE_STEPS.length) return { kind: 'done' }
  const inStep = t - index * period
  if (inStep < STEP_SEC) return { kind: 'breath', index }
  // El último escalón no tiene descanso: la prueba termina al acabar sus 2 min.
  if (index === RESONANCE_STEPS.length - 1) return { kind: 'done' }
  return { kind: 'rest', index }
}

/**
 * Recomendación: el escalón más cómodo. Desempate: sin falta de aire, y después el ritmo más alto
 * (más cerca de 6 rpm). Devuelve null si no hay ninguna puntuación.
 */
export function recommend(ratings: readonly StepRating[]): number | null {
  const rated = ratings.filter((r) => r.comfort !== null)
  if (rated.length === 0) return null
  const best = [...rated].sort(
    (a, b) =>
      (b.comfort ?? 0) - (a.comfort ?? 0) ||
      Number(a.airHunger === true) - Number(b.airHunger === true) ||
      b.rpm - a.rpm,
  )[0]
  return best?.rpm ?? null
}
