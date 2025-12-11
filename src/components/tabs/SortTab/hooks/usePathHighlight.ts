import { useState, useCallback, useEffect } from 'react'

interface PathInfo {
  id: string
  startPos: { x: number; y: number }
  endPos: { x: number; y: number }
  allPoints: { x: number; y: number }[]
}

interface UsePathHighlightProps {
  selectedNodeIds: Set<string>
  selectedPathInfo: PathInfo | null
}

export function usePathHighlight({
  selectedNodeIds,
  selectedPathInfo,
}: UsePathHighlightProps) {
  const [highlightedPathId, setHighlightedPathId] = useState<string | null>(null)
  const [isHighlightPersistent, setIsHighlightPersistent] = useState(false)
  const [showPointMarkers, setShowPointMarkers] = useState<'none' | 'start' | 'end' | 'all'>('none')
  const [pointMarkerCoords, setPointMarkerCoords] = useState<{ x: number; y: number }[]>([])

  // Clear highlight and point markers when selection changes
  useEffect(() => {
    setHighlightedPathId(null)
    setIsHighlightPersistent(false)
    setShowPointMarkers('none')
    setPointMarkerCoords([])
  }, [selectedNodeIds])

  // Apply/remove highlight effect on the SVG element
  useEffect(() => {
    if (!highlightedPathId) return

    const element = document.getElementById(highlightedPathId)
    if (!element) return

    const originalOutline = element.style.outline
    const originalOutlineOffset = element.style.outlineOffset

    element.style.outline = '3px solid #4a90e2'
    element.style.outlineOffset = '2px'

    return () => {
      element.style.outline = originalOutline
      element.style.outlineOffset = originalOutlineOffset
    }
  }, [highlightedPathId])

  const handlePathInfoMouseEnter = useCallback(() => {
    if (selectedPathInfo && !isHighlightPersistent) {
      setHighlightedPathId(selectedPathInfo.id)
    }
  }, [selectedPathInfo, isHighlightPersistent])

  const handlePathInfoMouseLeave = useCallback(() => {
    if (!isHighlightPersistent) {
      setHighlightedPathId(null)
    }
  }, [isHighlightPersistent])

  const handlePathInfoClick = useCallback(() => {
    if (selectedPathInfo) {
      if (isHighlightPersistent && highlightedPathId === selectedPathInfo.id) {
        setIsHighlightPersistent(false)
        setHighlightedPathId(null)
      } else {
        setHighlightedPathId(selectedPathInfo.id)
        setIsHighlightPersistent(true)
      }
    }
  }, [selectedPathInfo, isHighlightPersistent, highlightedPathId])

  const handleStartPointClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedPathInfo) return

    if (showPointMarkers === 'start') {
      setShowPointMarkers('none')
      setPointMarkerCoords([])
    } else {
      setShowPointMarkers('start')
      setPointMarkerCoords([selectedPathInfo.startPos])
      setHighlightedPathId(selectedPathInfo.id)
      setIsHighlightPersistent(true)
    }
  }, [selectedPathInfo, showPointMarkers])

  const handleEndPointClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedPathInfo) return

    if (showPointMarkers === 'end') {
      setShowPointMarkers('none')
      setPointMarkerCoords([])
    } else {
      setShowPointMarkers('end')
      setPointMarkerCoords([selectedPathInfo.endPos])
      setHighlightedPathId(selectedPathInfo.id)
      setIsHighlightPersistent(true)
    }
  }, [selectedPathInfo, showPointMarkers])

  const handlePointCountClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedPathInfo) return

    if (showPointMarkers === 'all') {
      setShowPointMarkers('none')
      setPointMarkerCoords([])
    } else {
      setShowPointMarkers('all')
      setPointMarkerCoords(selectedPathInfo.allPoints)
      setHighlightedPathId(selectedPathInfo.id)
      setIsHighlightPersistent(true)
    }
  }, [selectedPathInfo, showPointMarkers])

  const handleLayerPathHover = useCallback((pathId: string | null) => {
    if (!isHighlightPersistent) {
      setHighlightedPathId(pathId)
    }
  }, [isHighlightPersistent])

  const handleLayerPathClick = useCallback((pathId: string) => {
    if (isHighlightPersistent && highlightedPathId === pathId) {
      setIsHighlightPersistent(false)
      setHighlightedPathId(null)
    } else {
      setHighlightedPathId(pathId)
      setIsHighlightPersistent(true)
    }
  }, [isHighlightPersistent, highlightedPathId])

  return {
    highlightedPathId,
    isHighlightPersistent,
    showPointMarkers,
    pointMarkerCoords,
    handlePathInfoMouseEnter,
    handlePathInfoMouseLeave,
    handlePathInfoClick,
    handleStartPointClick,
    handleEndPointClick,
    handlePointCountClick,
    handleLayerPathHover,
    handleLayerPathClick,
  }
}
