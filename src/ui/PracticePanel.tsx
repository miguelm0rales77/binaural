import { RESONANCE_STEPS, type StepRating, type TestStep } from '../resonance'
import { goalMinutes, lastWeek, minutesByDay, streak, toCsv, type Goal, type PracticeEntry } from '../practice'

const f1 = (x: number) => x.toFixed(1).replace('.', ',')
const DAY = new Intl.DateTimeFormat('es', { weekday: 'short' })

export function PracticePanel(p: {
  entries: PracticeEntry[]
  goal: Goal
  onGoal: (g: Goal) => void
  today: string
}) {
  const days = minutesByDay(p.entries)
  const week = lastWeek(p.today)
  const target = goalMinutes(p.goal)
  const max = Math.max(target, ...week.map((d) => days.get(d) ?? 0), 1)
  const exportCsv = () => {
    const blob = new Blob([toCsv(p.entries)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'practica-respiracion.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section className="practice" aria-labelledby="practice-title">
      <h2 id="practice-title">Registro de práctica</h2>
      <p className="breath-intro">
        Racha: <strong>{streak(p.entries, p.today)}</strong> {streak(p.entries, p.today) === 1 ? 'día' : 'días'} · hoy{' '}
        <strong>{f1(days.get(p.today) ?? 0)}</strong> de {target} min (objetivo)
      </p>
      <div className="week" role="img" aria-label="Minutos practicados en los últimos siete días">
        {week.map((d) => {
          const v = days.get(d) ?? 0
          return (
            <div key={d} className="week-day">
              <div className="week-bar" style={{ height: `${Math.round((v / max) * 100)}%` }} />
              <span className="week-label">{DAY.format(new Date(`${d}T12:00:00`)).slice(0, 2)}</span>
              <span className="week-value">{f1(v)}</span>
            </div>
          )
        })}
        <div className="week-goal" style={{ bottom: `${Math.round((target / max) * 100)}%` }} aria-hidden="true" />
      </div>
      <fieldset className="goal">
        <legend>Objetivo diario</legend>
        <label className="field">
          <span>Sesiones al día</span>
          <input
            type="number"
            min={1}
            max={10}
            value={p.goal.sessionsPerDay}
            onChange={(e) => p.onGoal({ ...p.goal, sessionsPerDay: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>Minutos por sesión</span>
          <input
            type="number"
            min={1}
            max={120}
            value={p.goal.minutesPerSession}
            onChange={(e) => p.onGoal({ ...p.goal, minutesPerSession: Number(e.target.value) })}
          />
        </label>
        <small>Por defecto, 2 × 20 min al día (protocolo clásico de biofeedback).</small>
      </fieldset>
      <div className="practice-actions">
        <button type="button" onClick={exportCsv} disabled={p.entries.length === 0}>
          Exportar registro (CSV)
        </button>
        <small>
          {p.entries.length} sesiones guardadas en este dispositivo. Sin notificaciones.
        </small>
      </div>
    </section>
  )
}

export function ResonanceTest(p: {
  phase: 'idle' | 'running' | 'done'
  step: TestStep | null
  ratings: StepRating[]
  recommended: number | null
  saved: number | null
  disabled: boolean
  onStart: () => void
  onStop: () => void
  onRate: (index: number, patch: Partial<StepRating>) => void
  onSave: (rpm: number) => void
  onDismiss: () => void
}) {
  return (
    <section className="resonance" aria-labelledby="resonance-title">
      <h3 id="resonance-title">Mi frecuencia</h3>
      <p className="breath-intro">
        Prueba escalonada: 5 ritmos de 6,5 a 4,5 rpm, 2 min cada uno con 1 min de respiración libre entre medias
        (unos 14 min). Sin sensor de pulso esto es una aproximación por comodidad; la determinación precisa requiere
        medir la frecuencia cardíaca.
      </p>
      {p.saved !== null && <p className="muted">Frecuencia guardada: {f1(p.saved)} rpm (la usa «Resonancia 6»).</p>}

      {p.phase === 'idle' && (
        <button type="button" onClick={p.onStart} disabled={p.disabled}>
          Empezar la prueba
        </button>
      )}

      {p.phase === 'running' && p.step && (
        <div role="status" className="resonance-status">
          {p.step.kind === 'breath' && (
            <p>
              Escalón {p.step.index + 1} de {RESONANCE_STEPS.length}: respira a {f1(RESONANCE_STEPS[p.step.index] ?? 6)} rpm
              con la guía.
            </p>
          )}
          {p.step.kind === 'rest' && (
            <>
              <p>Descanso: respira libremente. Puntúa el escalón {p.step.index + 1}.</p>
              <RateStep index={p.step.index} ratings={p.ratings} onRate={p.onRate} />
            </>
          )}
          <button type="button" onClick={p.onStop}>
            Terminar la prueba
          </button>
        </div>
      )}

      {p.phase === 'done' && (
        <div className="resonance-result">
          <table>
            <caption>Resultados por escalón</caption>
            <thead>
              <tr>
                <th scope="col">rpm</th>
                <th scope="col">Comodidad (1–5)</th>
                <th scope="col">Falta de aire</th>
              </tr>
            </thead>
            <tbody>
              {p.ratings.map((r) => (
                <tr key={r.rpm}>
                  <td>{f1(r.rpm)}</td>
                  <td>{r.comfort ?? '—'}</td>
                  <td>{r.airHunger === null ? '—' : r.airHunger ? 'sí' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Recomendada: <strong>{p.recommended === null ? 'sin puntuaciones' : `${f1(p.recommended)} rpm`}</strong>
          </p>
          {p.recommended !== null && (
            <button type="button" onClick={() => p.onSave(p.recommended as number)}>
              Guardar {f1(p.recommended)} rpm
            </button>
          )}
          <button type="button" onClick={p.onDismiss}>
            Cerrar
          </button>
        </div>
      )}
    </section>
  )
}

function RateStep({
  index,
  ratings,
  onRate,
}: {
  index: number
  ratings: StepRating[]
  onRate: (index: number, patch: Partial<StepRating>) => void
}) {
  const r = ratings[index]
  if (!r) return null
  return (
    <fieldset className="rate">
      <legend>{f1(r.rpm)} rpm</legend>
      <label className="field">
        <span>Comodidad</span>
        <select value={r.comfort ?? ''} onChange={(e) => onRate(index, { comfort: e.target.value === '' ? null : Number(e.target.value) })}>
          <option value="">Sin puntuar</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={r.airHunger === true} onChange={(e) => onRate(index, { airHunger: e.target.checked })} />
        <span>He notado falta de aire</span>
      </label>
    </fieldset>
  )
}
