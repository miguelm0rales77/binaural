import { useEffect, useRef, useState } from 'react'
import { AudioController, type StateInfo } from './audio/AudioController'
import { bandFor } from './bands'
import type { EngineParams, NoiseType } from './dsp/types'
import { RANGES } from './dsp/params'
import { TIMER_OPTIONS_MIN, loadState, saveState } from './storage'
import { ModeSelector } from './ui/ModeSelector'
import { Slider } from './ui/Slider'
import { warningsFor } from './warnings'

type Status = 'stopped' | 'starting' | 'playing' | 'stopping'

const NOISE_LABELS: Record<NoiseType, string> = {
  none: 'Ninguno',
  white: 'Blanco',
  pink: 'Rosa',
  brown: 'Marrón',
}

const hz = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)} Hz`
const pct = (v: number) => `${Math.round(v * 100)} %`

function mmss(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function App() {
  const controller = useRef<AudioController | null>(null)
  const [initial] = useState(loadState)
  const [params, setParams] = useState<EngineParams>(initial.params)
  const [timerMin, setTimerMin] = useState<number | null>(initial.timerMin)
  const [status, setStatus] = useState<Status>('stopped')
  const [info, setInfo] = useState<StateInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const c = new AudioController()
    c.onState = setInfo
    c.onStopped = () => {
      setStatus('stopped')
      setInfo(null)
    }
    controller.current = c
    return () => {
      void c.dispose()
    }
  }, [])

  // Guarda el último estado (con un pequeño retardo para no escribir en cada tick del slider).
  useEffect(() => {
    const id = setTimeout(() => saveState({ params, timerMin }), 250)
    return () => clearTimeout(id)
  }, [params, timerMin])

  const update = (patch: Partial<EngineParams>) => {
    setParams((p) => ({ ...p, ...patch }))
    controller.current?.setParams(patch)
  }

  const changeTimer = (min: number | null) => {
    setTimerMin(min)
    controller.current?.setTimer(min === null ? null : min * 60)
  }

  const toggle = async () => {
    const c = controller.current
    if (!c) return
    if (status === 'playing') {
      setStatus('stopping')
      c.stop()
      return
    }
    if (status !== 'stopped') return
    setStatus('starting')
    setError(null)
    try {
      await c.play(params, null, timerMin === null ? null : timerMin * 60)
      setStatus('playing')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('stopped')
    }
  }

  const busy = status === 'starting' || status === 'stopping'
  const label = status === 'playing' ? 'Detener' : status === 'stopping' ? 'Deteniendo…' : 'Reproducir'
  const shownBeat = status === 'playing' && info ? info.beatHz : params.beatHz
  const band = bandFor(shownBeat)
  const warnings = warningsFor(params)
  const remaining = timerMin !== null && info ? timerMin * 60 - info.elapsedSec : null

  return (
    <main className="app">
      <h1>Binaural</h1>
      <p className="hint">Usa auriculares en modo binaural y mantén el volumen bajo.</p>

      <button className="play" onClick={toggle} disabled={busy} aria-live="polite">
        {label}
      </button>
      {error && (
        <p className="error" role="alert">
          No se pudo iniciar el audio: {error}
        </p>
      )}
      <p className="status" data-testid="status">
        {status === 'playing' && info
          ? remaining !== null && remaining <= 0
            ? 'Terminando la sesión…'
            : `Sonando · ${mmss(info.elapsedSec)}${remaining !== null ? ` · quedan ${mmss(remaining)}` : ''}`
          : status === 'stopping'
            ? 'Fundido de salida…'
            : 'Parado'}
      </p>

      <ModeSelector mode={params.mode} onChange={(mode) => update({ mode })} />

      <Slider
        label="Portadora"
        ariaLabel="Frecuencia portadora en hercios"
        scale="log"
        min={RANGES.carrierHz.min}
        max={RANGES.carrierHz.max}
        value={params.carrierHz}
        format={hz}
        onChange={(carrierHz) => update({ carrierHz })}
      />
      <Slider
        label="Pulso"
        ariaLabel="Frecuencia del pulso en hercios"
        scale="log"
        min={RANGES.beatHz.min}
        max={RANGES.beatHz.max}
        value={params.beatHz}
        format={hz}
        onChange={(beatHz) => update({ beatHz })}
      />

      <p className="band" data-band={band.id} data-testid="band">
        Banda: <strong>{band.name}</strong> <span>({band.range})</span>
      </p>
      {warnings.map((w) => (
        <p key={w} className="warning" role="status">
          ⚠ {w}
        </p>
      ))}

      {params.mode === 'isochronic' && (
        <Slider
          label="Profundidad isocrónica"
          ariaLabel="Profundidad de la modulación isocrónica"
          min={RANGES.isoDepth.min}
          max={RANGES.isoDepth.max}
          value={params.isoDepth}
          format={pct}
          onChange={(isoDepth) => update({ isoDepth })}
        />
      )}

      <Slider
        label="Volumen del tono"
        ariaLabel="Volumen del tono"
        min={0}
        max={1}
        value={params.toneGain}
        format={pct}
        onChange={(toneGain) => update({ toneGain })}
      />

      <div className="field">
        <label htmlFor="noise-type">Ruido de fondo</label>
        <select
          id="noise-type"
          value={params.noiseType}
          onChange={(e) => update({ noiseType: e.target.value as NoiseType })}
        >
          {(Object.keys(NOISE_LABELS) as NoiseType[]).map((t) => (
            <option key={t} value={t}>
              {NOISE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <Slider
        label="Volumen del ruido"
        ariaLabel="Volumen del ruido"
        min={0}
        max={1}
        value={params.noiseGain}
        disabled={params.noiseType === 'none'}
        format={pct}
        onChange={(noiseGain) => update({ noiseGain })}
      />

      <Slider
        label="Volumen general"
        ariaLabel="Volumen general"
        min={0}
        max={1}
        value={params.masterGain}
        format={pct}
        onChange={(masterGain) => update({ masterGain })}
      />

      <div className="field">
        <label htmlFor="timer">Temporizador</label>
        <select
          id="timer"
          value={timerMin ?? ''}
          onChange={(e) => changeTimer(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">Sin límite</option>
          {TIMER_OPTIONS_MIN.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
        <small>Al terminar, el sonido se apaga con un fundido de 8 s.</small>
      </div>
    </main>
  )
}
