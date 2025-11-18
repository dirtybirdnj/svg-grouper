import { useEffect, useRef, useState } from 'react'
import './SVGCanvas.css'

interface SVGCanvasProps {
  svgContent: string
  onSVGParsed?: (svgElement: SVGSVGElement) => void
}

export default function SVGCanvas({ svgContent, onSVGParsed }: SVGCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  useEffect(() => {
    // Parse and notify parent of SVG element
    if (containerRef.current) {
      const svgElement = containerRef.current.querySelector('svg')
      if (svgElement && onSVGParsed) {
        onSVGParsed(svgElement)
      }
    }
  }, [svgContent, onSVGParsed])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale(prev => Math.max(0.1, Math.min(10, prev * delta)))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left mouse button
      setIsPanning(true)
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  const handleFitToScreen = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  const handleZoomIn = () => {
    setScale(prev => Math.min(10, prev * 1.2))
  }

  const handleZoomOut = () => {
    setScale(prev => Math.max(0.1, prev / 1.2))
  }

  return (
    <div className="svg-canvas">
      <div className="canvas-controls">
        <button onClick={handleZoomIn} title="Zoom In">+</button>
        <button onClick={handleZoomOut} title="Zoom Out">-</button>
        <button onClick={handleFitToScreen} title="Fit to Screen">Fit</button>
        <span className="zoom-level">{Math.round(scale * 100)}%</span>
      </div>

      <div
        ref={containerRef}
        className={`canvas-content ${isPanning ? 'panning' : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>
    </div>
  )
}
