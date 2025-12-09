import { useState, useRef, useEffect } from 'react'
import './ColorSwatch.css'

interface ColorSwatchProps {
  color: string
  size?: 'small' | 'medium' | 'large'
  editable?: boolean
  onChange?: (newColor: string) => void
  showHex?: boolean
  className?: string
}

export function ColorSwatch({
  color,
  size = 'medium',
  editable = false,
  onChange,
  showHex = false,
  className = '',
}: ColorSwatchProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editColor, setEditColor] = useState(color)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditColor(color)
  }, [color])

  const handleClick = () => {
    if (editable) {
      setIsEditing(true)
      // Focus the hidden color input
      setTimeout(() => inputRef.current?.click(), 0)
    }
  }

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value
    setEditColor(newColor)
    onChange?.(newColor)
  }

  const handleBlur = () => {
    setIsEditing(false)
  }

  return (
    <div className={`color-swatch-container ${className}`}>
      <span
        className={`color-swatch size-${size} ${editable ? 'editable' : ''} ${isEditing ? 'editing' : ''}`}
        style={{ backgroundColor: color }}
        onClick={handleClick}
        title={editable ? 'Click to change color' : color}
      />
      {editable && (
        <input
          ref={inputRef}
          type="color"
          value={editColor}
          onChange={handleColorChange}
          onBlur={handleBlur}
          className="color-swatch-input"
        />
      )}
      {showHex && (
        <span className="color-swatch-hex">{color}</span>
      )}
    </div>
  )
}

interface ColorPaletteProps {
  colors: string[]
  selectedColor?: string
  onSelectColor?: (color: string) => void
  size?: 'small' | 'medium' | 'large'
  className?: string
}

export function ColorPalette({
  colors,
  selectedColor,
  onSelectColor,
  size = 'medium',
  className = '',
}: ColorPaletteProps) {
  return (
    <div className={`color-palette ${className}`}>
      {colors.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className={`color-swatch size-${size} ${selectedColor === color ? 'selected' : ''} ${onSelectColor ? 'selectable' : ''}`}
          style={{ backgroundColor: color }}
          onClick={() => onSelectColor?.(color)}
          title={color}
        />
      ))}
    </div>
  )
}

export default ColorSwatch
