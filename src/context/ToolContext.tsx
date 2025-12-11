// Tool Context - Active tool and settings

import { createContext, useContext, useState, useRef, ReactNode } from 'react'
import { ActiveToolType, ArrangeHandlers, ToolHandlers, OptimizationSettings } from './types'

interface ToolContextType {
  // Arrange handlers (set by SortTab, called from App menu)
  arrangeHandlers: React.MutableRefObject<ArrangeHandlers | null>

  // Tool handlers (set by SortTab, called from App menu)
  toolHandlers: React.MutableRefObject<ToolHandlers | null>

  // Tool overlay state
  activeTool: ActiveToolType
  setActiveTool: (tool: ActiveToolType) => void

  // Merge colors settings
  mergeColorTolerance: number
  setMergeColorTolerance: (tolerance: number) => void

  // Reduce palette settings
  reducePaletteCount: number
  setReducePaletteCount: (count: number) => void

  // Fill pattern settings
  fillPatternType: string
  setFillPatternType: (pattern: string) => void
  fillPatternSpacing: number
  setFillPatternSpacing: (spacing: number) => void
  fillPatternAngle: number
  setFillPatternAngle: (angle: number) => void
  fillPatternKeepStrokes: boolean
  setFillPatternKeepStrokes: (keep: boolean) => void

  // Plotter optimization settings (shared between OrderTab and ExportTab)
  optimizationSettings: OptimizationSettings
  setOptimizationSettings: (settings: OptimizationSettings) => void
}

const ToolContext = createContext<ToolContextType | null>(null)

export function ToolProvider({ children }: { children: ReactNode }) {
  // Arrange handlers (set by SortTab, called from App menu)
  const arrangeHandlers = useRef<ArrangeHandlers | null>(null)

  // Tool handlers (set by SortTab, called from App menu)
  const toolHandlers = useRef<ToolHandlers | null>(null)

  // Tool overlay state
  const [activeTool, setActiveTool] = useState<ActiveToolType>('none')

  // Merge colors settings
  const [mergeColorTolerance, setMergeColorTolerance] = useState(30) // 0-100, default 30

  // Reduce palette settings
  const [reducePaletteCount, setReducePaletteCount] = useState(6) // 2-16, default 6

  // Fill pattern settings
  const [fillPatternType, setFillPatternType] = useState('lines')
  const [fillPatternSpacing, setFillPatternSpacing] = useState(2.5)
  const [fillPatternAngle, setFillPatternAngle] = useState(45)
  const [fillPatternKeepStrokes, setFillPatternKeepStrokes] = useState(true)

  // Plotter optimization settings
  const [optimizationSettings, setOptimizationSettings] = useState<OptimizationSettings>({
    optimizePaths: true,
    joinPaths: true,
    joinTolerance: 0.5,
  })

  const value: ToolContextType = {
    arrangeHandlers,
    toolHandlers,
    activeTool,
    setActiveTool,
    mergeColorTolerance,
    setMergeColorTolerance,
    reducePaletteCount,
    setReducePaletteCount,
    fillPatternType,
    setFillPatternType,
    fillPatternSpacing,
    setFillPatternSpacing,
    fillPatternAngle,
    setFillPatternAngle,
    fillPatternKeepStrokes,
    setFillPatternKeepStrokes,
    optimizationSettings,
    setOptimizationSettings,
  }

  return <ToolContext.Provider value={value}>{children}</ToolContext.Provider>
}

export function useToolContext() {
  const context = useContext(ToolContext)
  if (!context) {
    throw new Error('useToolContext must be used within a ToolProvider')
  }
  return context
}
