import { useState, useCallback, useEffect, useRef } from 'react'

interface PanZoomState {
  scale: number
  offset: { x: number; y: number }
}

interface UsePanZoomOptions {
  initialScale?: number
  initialOffset?: { x: number; y: number }
  minScale?: number
  maxScale?: number
  // If provided, uses shared state from context instead of local state
  externalState?: {
    scale: number
    setScale: (scale: number) => void
    offset: { x: number; y: number }
    setOffset: (offset: { x: number; y: number }) => void
  }
}

interface UsePanZoomReturn {
  scale: number
  offset: { x: number; y: number }
  isPanning: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void
    onMouseMove: (e: React.MouseEvent) => void
    onMouseUp: () => void
    onMouseLeave: () => void
  }
  setScale: (scale: number) => void
  setOffset: (offset: { x: number; y: number }) => void
  resetView: () => void
}

/**
 * Hook for pan and zoom functionality on a container element.
 * Can use local state or connect to shared state from context.
 *
 * Usage:
 * ```tsx
 * const { scale, offset, handlers, containerRef } = usePanZoom({
 *   externalState: { scale, setScale, offset, setOffset } // from context
 * })
 *
 * return (
 *   <div ref={containerRef} {...handlers}>
 *     <div style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
 *       ...content
 *     </div>
 *   </div>
 * )
 * ```
 */
export function usePanZoom(options: UsePanZoomOptions = {}): UsePanZoomReturn {
  const {
    initialScale = 1,
    initialOffset = { x: 0, y: 0 },
    minScale = 0.1,
    maxScale = 10,
    externalState,
  } = options

  // Local state (used if no external state provided)
  const [localState, setLocalState] = useState<PanZoomState>({
    scale: initialScale,
    offset: initialOffset,
  })

  // Use external state if provided, otherwise local
  const scale = externalState?.scale ?? localState.scale
  const offset = externalState?.offset ?? localState.offset

  const setScale = useCallback((newScale: number) => {
    const clamped = Math.max(minScale, Math.min(maxScale, newScale))
    if (externalState) {
      externalState.setScale(clamped)
    } else {
      setLocalState(prev => ({ ...prev, scale: clamped }))
    }
  }, [externalState, minScale, maxScale])

  const setOffset = useCallback((newOffset: { x: number; y: number }) => {
    if (externalState) {
      externalState.setOffset(newOffset)
    } else {
      setLocalState(prev => ({ ...prev, offset: newOffset }))
    }
  }, [externalState])

  // Pan state
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Mouse handlers for panning
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) { // Left click only
      setIsPanning(true)
      panStartRef.current = {
        x: e.clientX - offset.x,
        y: e.clientY - offset.y,
      }
    }
  }, [offset])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      })
    }
  }, [isPanning, setOffset])

  const onMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const onMouseLeave = useCallback(() => {
    setIsPanning(false)
  }, [])

  // Wheel zoom handler - attached via useEffect for passive: false
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Support both regular scroll and pinch-to-zoom (ctrlKey is set for pinch)
      const delta = e.ctrlKey
        ? (e.deltaY > 0 ? 0.95 : 1.05) // Finer control for pinch
        : (e.deltaY > 0 ? 0.9 : 1.1)

      setScale(scale * delta)
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [scale, setScale])

  const resetView = useCallback(() => {
    setScale(initialScale)
    setOffset(initialOffset)
  }, [initialScale, initialOffset, setScale, setOffset])

  return {
    scale,
    offset,
    isPanning,
    containerRef,
    handlers: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave,
    },
    setScale,
    setOffset,
    resetView,
  }
}

export default usePanZoom
