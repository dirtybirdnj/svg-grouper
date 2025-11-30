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

// Data structure for the Order tab
export interface OrderLine {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  pathId: string
}

export interface OrderData {
  lines: OrderLine[]
  boundingBox: { x: number; y: number; width: number; height: number }
  source: 'fill' | 'sort'
  // For fill source, store the callback to apply the fill
  onApply?: (orderedLines: OrderLine[]) => void
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
  // Rebuild SVG content from layer tree (uses customMarkup when available)
  rebuildSvgFromLayers: (nodes?: SVGNode[]) => void
  // Flag to skip re-parsing when SVG is updated programmatically
  skipNextParse: React.MutableRefObject<boolean>
  // Refresh element references after SVG rebuild
  refreshElementRefs: () => void

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

  // Fill mode state - supports single ID or array of IDs for multiple selection
  fillTargetNodeIds: string[]
  setFillTargetNodeIds: (ids: string[]) => void

  // Order mode state
  orderData: OrderData | null
  setOrderData: (data: OrderData | null) => void

  // Processing state (for spinning gear indicator)
  isProcessing: boolean
  setIsProcessing: (processing: boolean) => void
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
  // Flag to skip re-parsing when SVG is updated programmatically
  const skipNextParse = useRef(false)

  const syncSvgContent = useCallback(() => {
    if (svgElementRef.current) {
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svgElementRef.current)
      setSvgContent(svgString)
    }
  }, [])

  // Rebuild SVG content from the layer tree
  // This uses customMarkup when available, otherwise the original element markup
  // Pass nodes explicitly to avoid stale closure issues
  const rebuildSvgFromLayers = useCallback((nodes?: SVGNode[]) => {
    const nodesToUse = nodes ?? layerNodes
    if (!svgElementRef.current || nodesToUse.length === 0) return

    // Get the root SVG element's attributes
    const rootSvg = svgElementRef.current
    const svgAttrs: string[] = []
    for (const attr of Array.from(rootSvg.attributes)) {
      svgAttrs.push(`${attr.name}="${attr.value}"`)
    }

    // Build content from layer nodes
    const buildNodeContent = (node: SVGNode): string => {
      // If node has custom markup (e.g., from line fill), use that
      if (node.customMarkup) {
        // Apply visibility
        if (node.isHidden) {
          // Wrap in a group with display:none
          return `<g style="display:none">${node.customMarkup}</g>`
        }
        return node.customMarkup
      }

      // For groups, build children recursively
      if (node.isGroup && node.children.length > 0) {
        const childContent = node.children.map(buildNodeContent).join('\n')
        const el = node.element
        const attrs: string[] = []
        let existingStyle = ''
        for (const attr of Array.from(el.attributes)) {
          if (attr.name === 'style') {
            // Handle style attribute separately to manage display:none
            existingStyle = attr.value
          } else {
            attrs.push(`${attr.name}="${attr.value}"`)
          }
        }

        // Manage visibility in style
        let finalStyle = existingStyle
        if (node.isHidden) {
          // Add display:none
          if (finalStyle && !finalStyle.includes('display:none')) {
            finalStyle = `display:none;${finalStyle}`
          } else if (!finalStyle) {
            finalStyle = 'display:none'
          }
        } else {
          // Remove display:none if present
          finalStyle = finalStyle.replace(/display:\s*none;?\s*/g, '').trim()
        }

        const styleAttr = finalStyle ? ` style="${finalStyle}"` : ''
        return `<${el.tagName} ${attrs.join(' ')}${styleAttr}>\n${childContent}\n</${el.tagName}>`
      }

      // For leaf nodes, use the element's outer HTML
      const serializer = new XMLSerializer()
      let markup = serializer.serializeToString(node.element)

      // Ensure the element has an ID for later lookup
      if (!markup.includes(` id="`)) {
        // Add the node ID to the element
        markup = markup.replace(/^<(\w+)/, `<$1 id="${node.id}"`)
      }

      // Apply visibility
      if (node.isHidden) {
        // Add display:none style
        if (markup.includes('style="')) {
          markup = markup.replace('style="', 'style="display:none;')
        } else {
          markup = markup.replace(/^<(\w+)(\s|>)/, '<$1 style="display:none"$2')
        }
      } else {
        // Remove display:none if present (element may have been hidden previously)
        markup = markup.replace(/display:\s*none;?\s*/g, '')
        // Clean up empty style attributes
        markup = markup.replace(/\s*style=""\s*/g, ' ')
      }

      return markup
    }

    const content = nodesToUse.map(buildNodeContent).join('\n')
    const newSvgContent = `<svg ${svgAttrs.join(' ')}>\n${content}\n</svg>`

    // Set flag to skip re-parsing since we're updating from layer state
    skipNextParse.current = true
    setSvgContent(newSvgContent)

    // Schedule element reference refresh after DOM updates
    // This ensures layer nodes have fresh element references
    setTimeout(() => {
      if (svgElementRef.current) {
        const refreshRefs = (nodes: SVGNode[]): SVGNode[] => {
          return nodes.map(node => {
            // Try to find fresh element by ID
            let newElement: Element | null = null
            try {
              newElement = svgElementRef.current?.querySelector(`#${CSS.escape(node.id)}`) || null
              // Also try hatch group ID
              if (!newElement && node.customMarkup) {
                newElement = svgElementRef.current?.querySelector(`#hatch-${CSS.escape(node.id)}`) || null
              }
            } catch {
              // CSS.escape might fail on some IDs
            }

            return {
              ...node,
              element: newElement || node.element,
              children: node.children.length > 0 ? refreshRefs(node.children) : node.children
            }
          })
        }

        const refreshedNodes = refreshRefs(nodesToUse)
        setLayerNodes(refreshedNodes)
      }
    }, 50) // Small delay to ensure DOM has updated
  }, [layerNodes, setLayerNodes])

  // Refresh element references in layer nodes after SVG rebuild
  // This re-queries the DOM to get fresh element references
  const refreshElementRefs = useCallback(() => {
    if (!svgElementRef.current) return

    const svg = svgElementRef.current

    const updateElementRefs = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.map(node => {
        // Try to find the element by ID in the new DOM
        let newElement = svg.querySelector(`#${CSS.escape(node.id)}`)

        // If element has customMarkup, look for the hatch group
        if (!newElement && node.customMarkup) {
          newElement = svg.querySelector(`#hatch-${CSS.escape(node.id)}`)
        }

        // Fall back to original element if not found (might be detached)
        const element = newElement || node.element

        return {
          ...node,
          element,
          children: node.children.length > 0 ? updateElementRefs(node.children) : node.children
        }
      })
    }

    const updatedNodes = updateElementRefs(layerNodes)
    setLayerNodes(updatedNodes)
  }, [layerNodes, setLayerNodes])

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

  // Fill mode state - supports multiple selected nodes
  const [fillTargetNodeIds, setFillTargetNodeIds] = useState<string[]>([])

  // Order mode state
  const [orderData, setOrderData] = useState<OrderData | null>(null)

  // Processing state (for spinning gear indicator)
  const [isProcessing, setIsProcessing] = useState(false)

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
    rebuildSvgFromLayers,
    skipNextParse,
    refreshElementRefs,
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
    fillTargetNodeIds,
    setFillTargetNodeIds,
    orderData,
    setOrderData,
    isProcessing,
    setIsProcessing,
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
