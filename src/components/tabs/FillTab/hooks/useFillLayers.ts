import { useCallback, useEffect, useRef, useMemo } from 'react'
import { HatchLine } from '../../../../utils/geometry'
import { FillPatternType } from '../../../../utils/fillPatterns'
import { FillLayer, FillLayerListItem } from '../types'
import { HatchedPath } from './useFillGeneration'

const MAX_ACCUMULATED_LAYERS = 100

interface UseFillLayersProps {
  // State
  accumulatedLayers: FillLayer[]
  setAccumulatedLayers: (layers: FillLayer[] | ((prev: FillLayer[]) => FillLayer[])) => void
  selectedLayerIds: Set<string>
  setSelectedLayerIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  selectedLayerId: string | null
  setSelectedLayerId: (id: string | null) => void
  layerColor: string
  setLayerColor: (color: string) => void
  // Settings
  angle: number
  setAngle: (angle: number) => void
  lineSpacing: number
  setLineSpacing: (spacing: number) => void
  fillPattern: FillPatternType
  setFillPattern: (pattern: FillPatternType) => void
  inset: number
  setInset: (inset: number) => void
  penWidth: number
  newLayerAngle: number
  // Data
  simplifiedHatchedPaths: HatchedPath[]
  showHatchPreview: boolean
  setShowHatchPreview: (show: boolean) => void
  fillPathsLength: number
}

/**
 * Hook for managing fill layers (add, delete, reorder, visibility, selection).
 */
export function useFillLayers({
  accumulatedLayers,
  setAccumulatedLayers,
  selectedLayerIds,
  setSelectedLayerIds,
  selectedLayerId,
  setSelectedLayerId,
  layerColor,
  setLayerColor,
  angle,
  setAngle,
  lineSpacing,
  setLineSpacing,
  fillPattern,
  setFillPattern,
  inset,
  setInset,
  penWidth,
  newLayerAngle,
  simplifiedHatchedPaths,
  showHatchPreview,
  setShowHatchPreview,
  fillPathsLength,
}: UseFillLayersProps) {
  // Track newly added layer that needs population
  const pendingLayerId = useRef<string | null>(null)
  const hasAutoAddedFirstLayer = useRef(false)
  const firstLayerId = useRef<string | null>(null)

  // Auto-enable preview on first load
  useEffect(() => {
    if (fillPathsLength > 0 && !showHatchPreview) {
      setShowHatchPreview(true)
    }
  }, [fillPathsLength]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-add first layer when entering Fill tab with paths but no layers
  useEffect(() => {
    if (simplifiedHatchedPaths.length > 0 && accumulatedLayers.length === 0 && !hasAutoAddedFirstLayer.current) {
      hasAutoAddedFirstLayer.current = true

      // Group paths by color
      const pathsByColor = new Map<string, typeof simplifiedHatchedPaths>()
      for (const hatchedPath of simplifiedHatchedPaths) {
        const color = hatchedPath.pathInfo.color || '#000000'
        if (!pathsByColor.has(color)) {
          pathsByColor.set(color, [])
        }
        pathsByColor.get(color)!.push(hatchedPath)
      }

      const newLayers: FillLayer[] = []
      const baseTimestamp = Date.now()
      let colorIndex = 0

      for (const [color, colorPaths] of pathsByColor) {
        const layerId = `layer-${baseTimestamp}-${colorIndex}-${Math.random().toString(36).substr(2, 9)}`

        if (colorIndex === 0) {
          firstLayerId.current = layerId
        }

        const colorLines: HatchLine[] = []
        colorPaths.forEach(({ lines }) => {
          colorLines.push(...lines)
        })

        const firstPath = colorPaths[0]?.pathInfo

        const newLayer: FillLayer = {
          id: layerId,
          lines: colorLines,
          color,
          originalColor: color,
          pathId: firstPath?.id || '',
          angle,
          lineSpacing,
          pattern: fillPattern,
          inset,
          lineCount: colorLines.length,
          penWidth,
          visible: true,
        }

        newLayers.push(newLayer)
        colorIndex++
      }

      setAccumulatedLayers(newLayers)
      if (newLayers.length > 0) {
        setSelectedLayerIds(new Set([newLayers[0].id]))
      }
    }
  }, [simplifiedHatchedPaths.length, accumulatedLayers.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update selected layers when settings change
  useEffect(() => {
    if (pendingLayerId.current) return
    if (selectedLayerIds.size === 0 || simplifiedHatchedPaths.length === 0) return

    const selectedIds = Array.from(selectedLayerIds)

    setAccumulatedLayers(prev => {
      let hasChanges = false

      const updated = prev.map(layer => {
        if (!selectedIds.includes(layer.id)) return layer

        const targetColor = (selectedLayerIds.size === 1 && layerColor) ? layerColor : layer.color

        const colorLines: HatchLine[] = []
        simplifiedHatchedPaths.forEach(({ pathInfo, lines }) => {
          if (pathInfo.color === layer.originalColor) {
            colorLines.push(...lines)
          }
        })

        if (colorLines.length === layer.lineCount &&
            layer.angle === angle &&
            layer.lineSpacing === lineSpacing &&
            layer.pattern === fillPattern &&
            layer.inset === inset &&
            layer.penWidth === penWidth &&
            layer.color === targetColor) {
          return layer
        }

        hasChanges = true
        return {
          ...layer,
          lines: colorLines,
          color: targetColor,
          angle,
          lineSpacing,
          pattern: fillPattern,
          inset,
          lineCount: colorLines.length,
          penWidth,
        }
      })

      return hasChanges ? updated : prev
    })
  }, [simplifiedHatchedPaths, layerColor, angle, lineSpacing, fillPattern, inset, penWidth, selectedLayerIds, setAccumulatedLayers])

  // Populate pending layer when lines regenerate
  useEffect(() => {
    if (!pendingLayerId.current || simplifiedHatchedPaths.length === 0) return

    const layerId = pendingLayerId.current
    const layer = accumulatedLayers.find(l => l.id === layerId)
    if (!layer) return

    if (layer.lines.length > 0) {
      pendingLayerId.current = null
      return
    }

    const originalColor = layer.originalColor
    const colorLines: HatchLine[] = []
    simplifiedHatchedPaths.forEach(({ pathInfo, lines }) => {
      if (pathInfo.color === originalColor) {
        colorLines.push(...lines)
      }
    })

    if (colorLines.length > 0) {
      setAccumulatedLayers(prev => prev.map(l => {
        if (l.id === layerId) {
          return { ...l, lines: colorLines, lineCount: colorLines.length }
        }
        return l
      }))
      pendingLayerId.current = null
    }
  }, [simplifiedHatchedPaths, accumulatedLayers, setAccumulatedLayers])

  // Add a new layer with rotated angle
  const handleAddLayer = useCallback(() => {
    const newAngle = (angle + newLayerAngle) % 180

    const pathsByColor = new Map<string, typeof simplifiedHatchedPaths>()
    for (const hatchedPath of simplifiedHatchedPaths) {
      const color = hatchedPath.pathInfo.color || '#000000'
      if (!pathsByColor.has(color)) {
        pathsByColor.set(color, [])
      }
      pathsByColor.get(color)!.push(hatchedPath)
    }

    if (pathsByColor.size === 0) {
      pathsByColor.set('#000000', [])
    }

    const newLayers: FillLayer[] = []
    const newLayerIds: string[] = []
    const baseTimestamp = Date.now()

    let colorIndex = 0
    for (const [color, colorPaths] of pathsByColor) {
      const layerId = `layer-${baseTimestamp}-${colorIndex}-${Math.random().toString(36).substr(2, 9)}`
      newLayerIds.push(layerId)

      const colorLines: HatchLine[] = []
      colorPaths.forEach(({ lines }) => {
        colorLines.push(...lines)
      })

      const firstPath = colorPaths[0]?.pathInfo

      const newLayer: FillLayer = {
        id: layerId,
        lines: colorLines,
        color,
        originalColor: color,
        pathId: firstPath?.id || '',
        angle: newAngle,
        lineSpacing,
        pattern: fillPattern,
        inset,
        lineCount: colorLines.length,
        penWidth,
        visible: true,
      }

      newLayers.push(newLayer)
      colorIndex++
    }

    setAccumulatedLayers(prev => {
      const combined = [...prev, ...newLayers]
      if (combined.length > MAX_ACCUMULATED_LAYERS) {
        console.warn(`[FillTab] Accumulated layers exceeded ${MAX_ACCUMULATED_LAYERS}, trimming`)
        return combined.slice(-MAX_ACCUMULATED_LAYERS)
      }
      return combined
    })

    if (newLayerIds.length > 0) {
      setSelectedLayerIds(new Set([newLayerIds[0]]))
    }

    pendingLayerId.current = newLayerIds[0] || null
    setAngle(newAngle)
    setLayerColor('')
  }, [simplifiedHatchedPaths, angle, newLayerAngle, lineSpacing, fillPattern, inset, penWidth, setAccumulatedLayers, setSelectedLayerIds, setAngle, setLayerColor])

  // Clear all accumulated layers
  const handleClearLayers = useCallback(() => {
    setAccumulatedLayers([])
    setLayerColor('')
    setSelectedLayerId(null)
  }, [setAccumulatedLayers, setLayerColor, setSelectedLayerId])

  // Delete a specific layer
  const handleDeleteLayer = useCallback((layerId: string) => {
    setAccumulatedLayers(prev => {
      const remaining = prev.filter(l => l.id !== layerId)
      if (remaining.length === 1) {
        setSelectedLayerIds(new Set([remaining[0].id]))
      } else {
        setSelectedLayerIds(prevIds => {
          const newIds = new Set(prevIds)
          newIds.delete(layerId)
          return newIds
        })
      }
      return remaining
    })
    if (selectedLayerId === layerId) {
      setSelectedLayerId(null)
    }
  }, [selectedLayerId, setAccumulatedLayers, setSelectedLayerIds, setSelectedLayerId])

  // Toggle visibility for a specific layer
  const handleToggleLayerVisibility = useCallback((layerId: string) => {
    setAccumulatedLayers(prev => prev.map(l =>
      l.id === layerId ? { ...l, visible: !l.visible } : l
    ))
  }, [setAccumulatedLayers])

  // Convert FillLayer[] to FillLayerListItem[] for UnifiedLayerList
  const layerListItems = useMemo<FillLayerListItem[]>(() => {
    return accumulatedLayers.map((layer) => ({
      id: layer.id,
      name: layer.pattern,
      color: layer.color,
      fillLayer: layer,
      pointCount: layer.lineCount,
      isVisible: layer.visible,
    }))
  }, [accumulatedLayers])

  // Handler for UnifiedLayerList selection changes
  const handleLayerSelectionChange = useCallback((ids: Set<string>) => {
    setSelectedLayerIds(ids)
    if (ids.size === 1) {
      const layerId = Array.from(ids)[0]
      const layer = accumulatedLayers.find(l => l.id === layerId)
      if (layer) {
        setAngle(layer.angle)
        setLineSpacing(layer.lineSpacing)
        setFillPattern(layer.pattern)
        setInset(layer.inset)
        setLayerColor(layer.color)
      }
    }
  }, [accumulatedLayers, setSelectedLayerIds, setAngle, setLineSpacing, setFillPattern, setInset, setLayerColor])

  // Handler for UnifiedLayerList reorder
  const handleLayerReorder = useCallback((fromIndex: number, toIndex: number) => {
    setAccumulatedLayers(prev => {
      const newLayers = [...prev]
      const [dragged] = newLayers.splice(fromIndex, 1)
      newLayers.splice(toIndex, 0, dragged)
      return newLayers
    })
  }, [setAccumulatedLayers])

  return {
    handleAddLayer,
    handleClearLayers,
    handleDeleteLayer,
    handleToggleLayerVisibility,
    layerListItems,
    handleLayerSelectionChange,
    handleLayerReorder,
  }
}
