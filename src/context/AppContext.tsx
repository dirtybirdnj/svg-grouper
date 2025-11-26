import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { SVGNode } from '../types/svg'
import { TabKey } from '../types/tabs'

interface LoadingState {
  isLoading: boolean
  progress: number
  status: string
  startTime?: number
  estimatedTimeLeft?: number
}

interface AppContextType {
  // Tab state
  activeTab: TabKey
  setActiveTab: (tab: TabKey) => void

  // SVG state
  svgContent: string | null
  setSvgContent: (content: string | null) => void
  fileName: string | null
  setFileName: (name: string | null) => void
  svgDimensions: { width: number; height: number } | null
  setSvgDimensions: (dims: { width: number; height: number } | null) => void

  // SVG element reference for syncing content
  svgElementRef: React.MutableRefObject<SVGSVGElement | null>
  syncSvgContent: () => void

  // Layer state
  layerNodes: SVGNode[]
  setLayerNodes: (nodes: SVGNode[]) => void
  selectedNodeIds: Set<string>
  setSelectedNodeIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  lastSelectedNodeId: string | null
  setLastSelectedNodeId: (id: string | null) => void

  // Loading state
  loadingState: LoadingState
  setLoadingState: (state: LoadingState) => void
  handleLoadStart: () => void
  handleProgress: (progress: number, status: string) => void

  // Parsing ref
  parsingRef: React.MutableRefObject<boolean>

  // Canvas state
  scale: number
  setScale: (scale: number) => void
  offset: { x: number; y: number }
  setOffset: (offset: { x: number; y: number }) => void

  // Crop state
  showCrop: boolean
  setShowCrop: (show: boolean) => void
  cropAspectRatio: '1:2' | '3:4' | '16:9' | '9:16'
  setCropAspectRatio: (ratio: '1:2' | '3:4' | '16:9' | '9:16') => void
  cropSize: number
  setCropSize: (size: number) => void

  // Armed states for confirmation buttons
  flattenArmed: boolean
  setFlattenArmed: (armed: boolean) => void
  cropArmed: boolean
  setCropArmed: (armed: boolean) => void
  statusMessage: string
  setStatusMessage: (message: string) => void

  // Fill mode state
  fillTargetNodeId: string | null
  setFillTargetNodeId: (id: string | null) => void
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('sort')

  // SVG state
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [svgDimensions, setSvgDimensions] = useState<{ width: number; height: number } | null>(null)

  // Layer state
  const [layerNodes, setLayerNodes] = useState<SVGNode[]>([])
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [lastSelectedNodeId, setLastSelectedNodeId] = useState<string | null>(null)

  // Loading state
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    progress: 0,
    status: '',
  })

  // Parsing ref
  const parsingRef = useRef(false)

  // SVG element reference for syncing content
  const svgElementRef = useRef<SVGSVGElement | null>(null)

  const syncSvgContent = useCallback(() => {
    if (svgElementRef.current) {
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svgElementRef.current)
      setSvgContent(svgString)
    }
  }, [])

  // Canvas state
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  // Crop state
  const [showCrop, setShowCrop] = useState(false)
  const [cropAspectRatio, setCropAspectRatio] = useState<'1:2' | '3:4' | '16:9' | '9:16'>('3:4')
  const [cropSize, setCropSize] = useState(0.25)

  // Armed states for confirmation buttons
  const [flattenArmed, setFlattenArmed] = useState(false)
  const [cropArmed, setCropArmed] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  // Fill mode state
  const [fillTargetNodeId, setFillTargetNodeId] = useState<string | null>(null)

  const handleLoadStart = useCallback(() => {
    setLoadingState({
      isLoading: true,
      progress: 0,
      status: 'Preparing...',
      startTime: Date.now(),
    })
  }, [])

  const handleProgress = useCallback((progress: number, status: string) => {
    setLoadingState(prev => {
      const elapsed = prev.startTime ? (Date.now() - prev.startTime) / 1000 : 0
      const estimatedTotal = progress > 5 ? (elapsed / progress) * 100 : 0
      const estimatedTimeLeft = progress > 5 ? estimatedTotal - elapsed : undefined

      return {
        ...prev,
        progress,
        status,
        estimatedTimeLeft,
      }
    })
  }, [])

  const value: AppContextType = {
    activeTab,
    setActiveTab,
    svgContent,
    setSvgContent,
    fileName,
    setFileName,
    svgDimensions,
    setSvgDimensions,
    svgElementRef,
    syncSvgContent,
    layerNodes,
    setLayerNodes,
    selectedNodeIds,
    setSelectedNodeIds,
    lastSelectedNodeId,
    setLastSelectedNodeId,
    loadingState,
    setLoadingState,
    handleLoadStart,
    handleProgress,
    parsingRef,
    scale,
    setScale,
    offset,
    setOffset,
    showCrop,
    setShowCrop,
    cropAspectRatio,
    setCropAspectRatio,
    cropSize,
    setCropSize,
    flattenArmed,
    setFlattenArmed,
    cropArmed,
    setCropArmed,
    statusMessage,
    setStatusMessage,
    fillTargetNodeId,
    setFillTargetNodeId,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppContext() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider')
  }
  return context
}
