import type { BackgroundState } from '../audio/BackgroundPlayer'
import { AlertIcon } from './icons'

interface Props {
  state: BackgroundState
  progress: number
  hasProgram: boolean
  /** Los parámetros cambiaron después de generar el bucle. */
  stale: boolean
  disabled: boolean
  onStart: () => void
  onStop: () => void
  error: string | null
}

export function BackgroundPanel({ state, progress, hasProgram, stale, disabled, onStart, onStop, error }: Props) {
  const busy = state === 'preparing'
  const active = state === 'playing' || state === 'paused'
  return (
    <details className="panel background">
      <summary>
        <h2>Reproducir en segundo plano</h2>
      </summary>
      <p className="muted">
        En el iPhone el audio normal se corta al bloquear la pantalla. Este modo genera un bucle de 5 minutos y lo
        reproduce como un archivo de audio, que sigue sonando con la pantalla bloqueada y no depende del interruptor de
        silencio. Los controles de reproducción del sistema funcionan.
      </p>
      <ul className="muted notes">
        <li>Usa los valores actuales y no incluye fundidos.</li>
        <li>El temporizador no se aplica en este modo (usa el del móvil).</li>
        {hasProgram && <li>Un programa no se puede repetir en bucle: se usa su primer paso.</li>}
      </ul>

      <div className="export-actions">
        {!active && !busy && (
          <button type="button" className="secondary" onClick={onStart} disabled={disabled}>
            Reproducir en segundo plano
          </button>
        )}
        {active && stale && (
          <button type="button" className="secondary" onClick={onStart}>
            Regenerar con los cambios
          </button>
        )}
        {(active || busy) && (
          <button type="button" className="secondary" onClick={onStop}>
            {busy ? 'Cancelar' : 'Detener'}
          </button>
        )}
      </div>

      {busy && (
        <div className="progress" data-testid="bg-progress">
          <progress max={100} value={Math.round(progress * 100)} aria-label="Preparando el bucle" />
          <span>{Math.round(progress * 100)} %</span>
        </div>
      )}
      {active && (
        <p role="status" data-testid="bg-status">
          {state === 'playing' ? 'Sonando en segundo plano (bucle de 5 min).' : 'En pausa.'}
          {stale && ' Has cambiado ajustes: pulsa «Regenerar» para aplicarlos.'}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          <AlertIcon />
          <span>No se pudo iniciar: {error}</span>
        </p>
      )}
    </details>
  )
}
