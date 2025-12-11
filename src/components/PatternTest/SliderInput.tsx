// Slider+Text combo input component
interface SliderInputProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
}

export function SliderInput({ label, value, onChange, min, max, step = 1, unit }: SliderInputProps) {
  return (
    <div className="slider-input">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="slider-range"
      />
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="slider-number"
      />
      {unit && <span className="slider-unit">{unit}</span>}
    </div>
  )
}
