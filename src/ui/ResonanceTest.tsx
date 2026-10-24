import { useEffect, useRef, useState } from 'react'
import { REST_SEC, RESONANCE_STEPS, STEP_SEC, afterRest, recommend, stepDone, type StepScore } from '../resonance'

type Phase = 'idle' | 'starting' | 'step' | 'rest' | 'done'
type Comfort = StepScore['comfort']

interface Props {
  /** El audio está sonando (la prueba empieza cuando lo está). */
  playing: boolean
  /** El aviso de seguridad de la respiración ya se aceptó (sin él no se activa la guía). */
  ready: boolean
  /** Frecuencia guardada como predeterminada, o null si no se ha hecho la prueba. */
  saved: number | null
  /** Reloj del motor: `now` tiempo actual del contexto; `startedAt` cuándo empezó el ciclo actual. */
  clock: () => { now: number | null; startedAt: number }
  onStart: (rpm: number) => void
  onBreath: (enabled: boolean, rpm: number) => void
  onStop: () => void
  onDone: (rpm: number) => void
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
const fmt1 = (v: number) => v.toFixed(1).replace('.', ',')
const COMFORT_LABEL: Record<Comfort, string> = {
  1: 'Muy incómodo',
  2: 'Incómodo',
  3: 'Regular',
  4: 'Cómodo',
  5: 'Muy cómodo',
}

/**
 * «Mi frecuencia» (sin sensor): cinco escalones de 2 min con respiración guiada, cada uno seguido de 1 min de
 * respiración libre y una puntuación. El tiempo sale del reloj del motor, como el círculo de «Respirar».
 */
export function ResonanceTest({ playing, ready, saved, clock, onStart, onBreath, onStop, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [index, setIndex] = useState(0)
  const [secsLeft, setSecsLeft] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [comfort, setComfort] = useState<Comfort>(3)
  const [short, setShort] = useState(false)
  const [scores, setScores] = useState<StepScore[]>([])
  const [result, setResult] = useState<number | null>(null)

  // Estado vigente para el bucle de tiempo (sin reiniciarlo en cada render).
  const live = useRef({ playing, clock, onBreath, onStop, onDone, phase, index, submitted, scores, restStart: 0 })
  useEffect(() => {
    live.current = { ...live.current, playing, clock, onBreath, onStop, onDone, phase, index, submitted, scores }
  })

  useEffect(() => {
    if (phase !== 'starting' && phase !== 'step' && phase !== 'rest') return
    let raf = 0
    const frame = () => {
      const s = live.current
      const { now, startedAt } = s.clock()
      if (s.phase === 'starting' && s.playing && now !== null && startedAt > 0) {
        setPhase('step')
        setIndex(0)
      } else if (s.phase === 'step' && now !== null) {
        const elapsed = now - s.clock().startedAt
        setSecsLeft(Math.max(0, Math.ceil(STEP_SEC - elapsed)))
        if (stepDone(elapsed)) {
          // Fin del escalón: respiración libre (sin guía); en el último escalón, la puntuación llega igual.
          s.onBreath(false, RESONANCE_STEPS[s.index] as number)
          live.current.restStart = now
          setSubmitted(false)
          setPhase('rest')
        }
      } else if (s.phase === 'rest' && now !== null) {
        const restElapsed = now - s.restStart
        setSecsLeft(Math.max(0, Math.ceil(REST_SEC - restElapsed)))
        const next = afterRest(s.index, restElapsed, s.submitted)
        if (next !== 'wait') {
          if (next === 'finish') {
            const rec = recommend(s.scores)
            setResult(rec)
            setPhase('done')
            s.onStop()
            if (rec !== null) s.onDone(rec)
            raf = 0
            return
          }
          const nextIndex = s.index + 1
          setIndex(nextIndex)
          setPhase('step')
          // Cada escalón empieza un ciclo limpio en el instante del cambio (el motor lo hace al cambiar el ritmo).
          s.onBreath(true, RESONANCE_STEPS[nextIndex] as number)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  const begin = () => {
    setScores([])
    setResult(null)
    setSubmitted(false)
    setComfort(3)
    setShort(false)
    setPhase('starting')
    onStart(RESONANCE_STEPS[0] as number)
  }

  const cancel = () => {
    onStop()
    setPhase('idle')
  }

  const submit = () => {
    const rpm = RESONANCE_STEPS[index] as number
    const next = [...live.current.scores, { rpm, comfort, shortOfBreath: short }]
    live.current.scores = next
    setScores(next)
    setSubmitted(true)
    setComfort(3)
    setShort(false)
  }

  const rpm = RESONANCE_STEPS[index] as number
  const last = index === RESONANCE_STEPS.length - 1

  return (
    <details className="panel resonance">
      <summary>
        <h2>Mi frecuencia</h2>
      </summary>
      <p className="muted">
        Prueba para encontrar tu ritmo más cómodo, sin sensor: cinco escalones de 6,5 a 4,5 rpm, de 2 minutos cada uno y
        un minuto de respiración libre entre medias. Al terminar, puntúa cada escalón. Dura unos 14 minutos.
      </p>
      <p className="muted">
        Sin sensor de pulso esto es una aproximación por comodidad; la determinación precisa requiere medir la frecuencia
        cardíaca.
      </p>
      <p className="muted">
        Frecuencia guardada: {saved === null ? 'ninguna todavía (se usa 6 rpm)' : `${fmt1(saved)} rpm`}.
      </p>

      {phase === 'idle' && (
        <>
          <button type="button" className="play" onClick={begin} disabled={!ready}>
            Empezar la prueba
          </button>
          {!ready && (
            <p className="muted">Antes activa la respiración guiada en «Respirar» para leer su aviso de seguridad.</p>
          )}
        </>
      )}

      {(phase === 'starting' || phase === 'step' || phase === 'rest') && (
        <div className="resonance-live" aria-live="polite">
          <p className="resonance-status" data-testid="resonance-status">
            {phase === 'starting' && 'Preparando la prueba…'}
            {phase === 'step' && `Escalón ${index + 1} de ${RESONANCE_STEPS.length} · ${fmt1(rpm)} rpm · quedan ${mmss(secsLeft)}`}
            {phase === 'rest' &&
              (last
                ? `Último escalón (${fmt1(rpm)} rpm) terminado: puntúalo para ver el resultado.`
                : `Respira libremente. Puntúa el escalón de ${fmt1(rpm)} rpm. Siguiente en ${mmss(secsLeft)}.`)}
          </p>

          {phase === 'rest' && !submitted && (
            <fieldset className="resonance-score">
              <legend>¿Cómo ha sido el escalón de {fmt1(rpm)} rpm?</legend>
              <div className="resonance-comfort">
                {([1, 2, 3, 4, 5] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="secondary"
                    aria-pressed={comfort === c}
                    onClick={() => setComfort(c)}
                  >
                    {c} · {COMFORT_LABEL[c]}
                  </button>
                ))}
              </div>
              <label className="check">
                <input type="checkbox" checked={short} onChange={(e) => setShort(e.target.checked)} />
                <span>
                  Me ha faltado el aire
                  <small>Si lo has notado en algún momento de este escalón.</small>
                </span>
              </label>
              <button type="button" className="secondary" onClick={submit}>
                Anotar la puntuación
              </button>
            </fieldset>
          )}

          <button type="button" className="secondary" onClick={cancel}>
            Cancelar la prueba
          </button>
        </div>
      )}

      {phase === 'done' && result !== null && (
        <div className="resonance-result" role="status" data-testid="resonance-result">
          <p>
            <strong>Tu frecuencia más cómoda: {fmt1(result)} rpm.</strong> Queda guardada como predeterminada: el preset
            «Resonancia» la usa.
          </p>
          <ul>
            {scores.map((s) => (
              <li key={s.rpm}>
                {fmt1(s.rpm)} rpm · comodidad {s.comfort}
                {s.shortOfBreath ? ' · faltó el aire' : ''}
              </li>
            ))}
          </ul>
          <p className="muted">Se recomienda al ritmo más cómodo que no dejó falta de aire.</p>
          <button type="button" className="secondary" onClick={() => setPhase('idle')}>
            Hacer la prueba otra vez
          </button>
        </div>
      )}

    </details>
  )
}
