import { useEffect, useRef, useState } from 'react'
import { LARGE_EXPORT_BYTES, MAX_EXPORT_MINUTES, estimateBytes, exportFileName, formatMB } from '../audio/exportInfo'
import { LOOP_SECONDS } from '../audio/render'
import { downloadBlob, exportWav, type ExportHandle } from '../audio/wavExport'
import type { EngineParams, Program } from '../dsp/types'

interface Props {
  params: EngineParams
  program: Program | null
  /** Minutos sugeridos (temporizador actual); null = sin límite. */
  timerMin: number | null
  disabled: boolean
}

type State =
  | { kind: 'idle' }
  | { kind: 'running'; fraction: number }
  | { kind: 'done'; name: string; bytes: number }
  | { kind: 'error'; message: string }

export function ExportPanel({ params, program, timerMin, disabled }: Props) {
  const programMin = program ? Math.min(MAX_EXPORT_MINUTES, Math.max(1, Math.ceil(program.durationSec / 60))) : null
  const maxMin = programMin ?? MAX_EXPORT_MINUTES
  // Al cargar un preset (programa o temporizador distintos) se propone su duración.
  const suggested = Math.min(maxMin, programMin ?? timerMin ?? 20)
  const [minutes, setMinutes] = useState<number>(suggested)
  const [prevSuggested, setPrevSuggested] = useState(suggested)
  if (suggested !== prevSuggested) {
    setPrevSuggested(suggested)
    setMinutes(suggested)
  }
  const [loop, setLoop] = useState(false)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const handle = useRef<ExportHandle | null>(null)

  useEffect(() => () => handle.current?.cancel(), [])

  const safeMinutes = Math.min(maxMin, Math.max(1, Math.round(minutes) || 1))
  const bytes = estimateBytes({ loop, minutes: safeMinutes })
  const running = state.kind === 'running'

  const start = async () => {
    if (running || disabled) return
    setState({ kind: 'running', fraction: 0 })
    const h = exportWav(
      loop
        ? { kind: 'loop', params }
        : { kind: 'session', params, program, seconds: safeMinutes * 60 },
      (fraction) => setState({ kind: 'running', fraction }),
    )
    handle.current = h
    try {
      const blob = await h.promise
      const name = exportFileName(params, { loop, minutes: safeMinutes, program: loop ? null : program })
      downloadBlob(blob, name)
      setState({ kind: 'done', name, bytes: blob.size })
    } catch (e) {
      if (e instanceof Error && e.message === 'cancelled') setState({ kind: 'idle' })
      else setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      handle.current = null
    }
  }

  const pct = running ? Math.round(state.fraction * 100) : 0

  return (
    <details className="panel export">
      <summary>
        <h2>Exportar a WAV</h2>
      </summary>
      <p className="muted">
        Genera un archivo de audio (PCM de 16 bits, estéreo, 44,1 kHz) con la configuración actual. Se crea en tu
        dispositivo, sin enviar nada a ningún sitio.
      </p>

      <label className="check">
        <input type="checkbox" checked={loop} disabled={running} onChange={(e) => setLoop(e.target.checked)} />
        <span>
          Bucle de {LOOP_SECONDS / 60} min
          <small>
            Archivo más pequeño, pensado para reproducirlo en bucle: el empalme no se nota. No incluye fundidos ni
            programa.
          </small>
        </span>
      </label>

      {!loop && (
        <div className="field">
          <label htmlFor="export-minutes">Duración (minutos, máximo {maxMin})</label>
          <input
            id="export-minutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={maxMin}
            step={1}
            value={minutes}
            disabled={running}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
          <small>
            Incluye un fundido de entrada y otro de salida de 8 s.
            {program && ` Se exporta el programa «${program.name}».`}
          </small>
        </div>
      )}

      <p className="muted" data-testid="export-size">
        Tamaño aproximado: <strong>{formatMB(bytes)}</strong>
        {bytes >= LARGE_EXPORT_BYTES && ' · los archivos grandes tardan más y usan mucha memoria'}
      </p>

      <div className="export-actions">
        <button type="button" className="secondary" onClick={start} disabled={running || disabled}>
          {running ? 'Generando…' : 'Exportar WAV'}
        </button>
        {running && (
          <button type="button" className="secondary" onClick={() => handle.current?.cancel()}>
            Cancelar
          </button>
        )}
      </div>

      {running && (
        <div className="progress" data-testid="export-progress">
          <progress max={100} value={pct} aria-label="Progreso de la exportación" />
          <span>{pct} %</span>
        </div>
      )}
      {state.kind === 'done' && (
        <p role="status" data-testid="export-done">
          Listo: <strong>{state.name}</strong> ({formatMB(state.bytes)}). Se ha descargado en tu dispositivo.
        </p>
      )}
      {state.kind === 'error' && (
        <p className="error" role="alert">
          No se pudo exportar: {state.message}
        </p>
      )}
    </details>
  )
}
