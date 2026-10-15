import { downloadBlob } from '../audio/wavExport'
import { GOAL_RANGE_MIN, lastDays, minutesOn, streak, toCsv, type PracticeEntry } from '../practice'

interface Props {
  entries: readonly PracticeEntry[]
  goalMin: number
  today: string
  onGoalChange: (min: number) => void
}

const DAY_NAMES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** Día de la semana de una fecha AAAA-MM-DD (en calendario local, sin desfases de zona horaria). */
function dayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return DAY_NAMES[new Date(y, m - 1, d).getDay()] as string
}

const fmtMin = (v: number) => (v < 10 ? v.toFixed(1).replace('.', ',') : String(Math.round(v)))

/** Registro de práctica: minutos de hoy frente al objetivo, la semana, la racha y la exportación. Sin notificaciones. */
export function PracticePanel({ entries, goalMin, today, onGoalChange }: Props) {
  const days = lastDays(today)
  const minutes = days.map((d) => minutesOn(entries, d))
  const todayMin = minutes[minutes.length - 1] ?? 0
  const top = Math.max(goalMin, ...minutes, 1)
  const streakDays = streak(entries, today)

  const exportCsv = () => {
    const blob = new Blob([toCsv(entries)], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, `respiracion-registro-${today}.csv`)
  }

  return (
    <details className="panel practice">
      <summary>
        <h2>Registro de práctica</h2>
      </summary>
      <p className="muted">
        Cada sesión de respiración guiada se guarda en este dispositivo: fecha, duración, ritmo y preset. No se envía
        nada ni hay notificaciones.
      </p>

      <div className="practice-today">
        <p>
          <strong>Hoy:</strong> {fmtMin(todayMin)} de {goalMin} min
          {todayMin >= goalMin ? ' · objetivo cumplido' : ''}
        </p>
        <p>
          <strong>Racha:</strong> {streakDays} {streakDays === 1 ? 'día' : 'días'} seguidos con sesión
        </p>
      </div>

      <div className="practice-week" role="img" aria-label={`Minutos de los últimos 7 días: ${days.map((d, i) => `${dayName(d)} ${fmtMin(minutes[i] ?? 0)}`).join(', ')}`}>
        {days.map((d, i) => {
          const v = minutes[i] ?? 0
          return (
            <div key={d} className="practice-day" data-date={d}>
              <div className="practice-bar-wrap">
                <div className="practice-bar" style={{ height: `${Math.round((v / top) * 100)}%` }} />
                <div className="practice-goal-line" style={{ bottom: `${Math.round((goalMin / top) * 100)}%` }} />
              </div>
              <span className="practice-day-name">{dayName(d)}</span>
              <span className="practice-day-min">{fmtMin(v)}</span>
            </div>
          )
        })}
      </div>

      <div className="field">
        <label htmlFor="practice-goal">Objetivo diario</label>
        <input
          id="practice-goal"
          type="number"
          inputMode="numeric"
          min={GOAL_RANGE_MIN.min}
          max={GOAL_RANGE_MIN.max}
          step={5}
          value={goalMin}
          onChange={(e) => {
            const v = Math.round(Number(e.target.value))
            if (Number.isFinite(v) && v >= GOAL_RANGE_MIN.min && v <= GOAL_RANGE_MIN.max) onGoalChange(v)
          }}
        />
        <small>Por defecto, 40 min al día (2 × 20 min, como en el protocolo clásico). Puedes cambiarlo.</small>
      </div>

      <button type="button" className="secondary" onClick={exportCsv} disabled={entries.length === 0}>
        Exportar el registro a CSV
      </button>
      {entries.length === 0 && <p className="muted">Todavía no hay sesiones registradas.</p>}
    </details>
  )
}
