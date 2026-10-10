const STEPS = 1000

interface SliderProps {
  label: string
  ariaLabel: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  format: (v: number) => string
  /** 'log' reparte el recorrido de forma logarítmica (portadora y pulso). */
  scale?: 'linear' | 'log'
  step?: number
  disabled?: boolean
}

export function Slider({ label, ariaLabel, value, min, max, onChange, format, scale = 'linear', step, disabled }: SliderProps) {
  const log = scale === 'log'
  const toPos = (v: number) => Math.round((Math.log(v / min) / Math.log(max / min)) * STEPS)
  const toValue = (pos: number) => min * Math.pow(max / min, pos / STEPS)
  return (
    <label className="field">
      <span>
        {label} <output>{format(value)}</output>
      </span>
      <input
        type="range"
        min={log ? 0 : min}
        max={log ? STEPS : max}
        step={log ? 1 : (step ?? 0.01)}
        value={log ? toPos(value) : value}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(log ? toValue(Number(e.target.value)) : Number(e.target.value))}
      />
    </label>
  )
}
