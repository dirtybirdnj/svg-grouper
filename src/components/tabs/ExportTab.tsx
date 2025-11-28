import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useAppContext } from '../../context/AppContext'
import { SVGNode } from '../../types/svg'
import defaultPaperSizes from '../../config/paperSizes.json'
import './ExportTab.css'

// Paper size type
interface PaperSize {
  id: string
  label: string
  width: number
  height: number
  unit: string
}

// Convert mm to pixels (assuming 96 DPI, 1 inch = 25.4mm)
const MM_TO_PX = 96 / 25.4

// Local storage key for custom paper sizes
const PAPER_SIZES_STORAGE_KEY = 'svg-grouper-paper-sizes'

// Load paper sizes from localStorage or use defaults
function loadPaperSizes(): PaperSize[] {
  try {
    const stored = localStorage.getItem(PAPER_SIZES_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch (e) {
    console.error('Failed to load paper sizes from localStorage:', e)
  }
  return defaultPaperSizes.paperSizes as PaperSize[]
}

// Save paper sizes to localStorage
function savePaperSizes(sizes: PaperSize[]): void {
  try {
    localStorage.setItem(PAPER_SIZES_STORAGE_KEY, JSON.stringify(sizes))
  } catch (e) {
    console.error('Failed to save paper sizes to localStorage:', e)
  }
}

interface SVGStatistics {
  totalNodes: number
  totalPaths: number
  totalGroups: number
  totalShapes: number
  maxDepth: number
  colorPalette: string[]
  operationCounts: Record<string, number>
  layerStats: { name: string; paths: number; depth: number; colors: string[] }[]
}

function analyzeSVG(nodes: SVGNode[]): SVGStatistics {
  const stats: SVGStatistics = {
    totalNodes: 0,
    totalPaths: 0,
    totalGroups: 0,
    totalShapes: 0,
    maxDepth: 0,
    colorPalette: [],
    operationCounts: {},
    layerStats: [],
  }

  const colors = new Set<string>()

  const countOperations = (element: Element) => {
    const d = element.getAttribute('d')
    if (d) {
      // Count path commands
      const commands = d.match(/[MLHVCSQTAZ]/gi) || []
      commands.forEach(cmd => {
        const key = cmd.toUpperCase()
        stats.operationCounts[key] = (stats.operationCounts[key] || 0) + 1
      })
    }
  }

  const extractColors = (element: Element) => {
    const fill = element.getAttribute('fill')
    const stroke = element.getAttribute('stroke')
    const style = element.getAttribute('style')

    if (fill && fill !== 'none' && fill !== 'transparent') {
      colors.add(fill)
    }
    if (stroke && stroke !== 'none' && stroke !== 'transparent') {
      colors.add(stroke)
    }

    if (style) {
      const fillMatch = style.match(/fill:\s*([^;]+)/)
      const strokeMatch = style.match(/stroke:\s*([^;]+)/)
      if (fillMatch && fillMatch[1] !== 'none') colors.add(fillMatch[1].trim())
      if (strokeMatch && strokeMatch[1] !== 'none') colors.add(strokeMatch[1].trim())
    }
  }

  const traverse = (node: SVGNode, depth: number) => {
    stats.totalNodes++
    stats.maxDepth = Math.max(stats.maxDepth, depth)

    if (node.isGroup) {
      stats.totalGroups++
    }

    const tagName = node.element.tagName.toLowerCase()
    if (['path', 'line', 'polyline', 'polygon'].includes(tagName)) {
      stats.totalPaths++
      countOperations(node.element)
    }

    if (['rect', 'circle', 'ellipse'].includes(tagName)) {
      stats.totalShapes++
    }

    // Check for fillColor from line fill (customMarkup nodes)
    if (node.fillColor) {
      colors.add(node.fillColor)
    }

    extractColors(node.element)

    node.children.forEach(child => traverse(child, depth + 1))
  }

  // Calculate layer stats
  const collectLayerStats = (node: SVGNode, depth: number) => {
    let pathCount = 0
    const layerColors = new Set<string>()

    const collectFromNode = (n: SVGNode) => {
      const tagName = n.element.tagName.toLowerCase()
      if (['path', 'line', 'polyline', 'polygon'].includes(tagName)) {
        pathCount++
      }

      // Check for fillColor from line fill (customMarkup nodes)
      if (n.fillColor) {
        layerColors.add(n.fillColor)
      }

      // Extract colors from this element
      const fill = n.element.getAttribute('fill')
      const stroke = n.element.getAttribute('stroke')
      const style = n.element.getAttribute('style')

      if (fill && fill !== 'none' && fill !== 'transparent') {
        layerColors.add(fill)
      }
      if (stroke && stroke !== 'none' && stroke !== 'transparent') {
        layerColors.add(stroke)
      }
      if (style) {
        const fillMatch = style.match(/fill:\s*([^;]+)/)
        const strokeMatch = style.match(/stroke:\s*([^;]+)/)
        if (fillMatch && fillMatch[1] !== 'none') layerColors.add(fillMatch[1].trim())
        if (strokeMatch && strokeMatch[1] !== 'none') layerColors.add(strokeMatch[1].trim())
      }

      n.children.forEach(collectFromNode)
    }
    collectFromNode(node)

    stats.layerStats.push({
      name: node.name || node.id,
      paths: pathCount,
      depth,
      colors: Array.from(layerColors),
    })

    node.children.forEach(child => {
      if (child.isGroup) {
        collectLayerStats(child, depth + 1)
      }
    })
  }

  nodes.forEach(node => {
    traverse(node, 0)
    if (node.isGroup) {
      collectLayerStats(node, 0)
    }
  })

  stats.colorPalette = Array.from(colors)

  return stats
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

const COMMAND_NAMES: Record<string, string> = {
  'M': 'MoveTo',
  'L': 'LineTo',
  'H': 'HorizLineTo',
  'V': 'VertLineTo',
  'C': 'CurveTo',
  'S': 'SmoothCurve',
  'Q': 'QuadCurve',
  'T': 'SmoothQuad',
  'A': 'Arc',
  'Z': 'ClosePath',
}

// Check if a node has fills (not strokes) that would need conversion
function nodeHasFills(node: SVGNode): boolean {
  const el = node.element
  const tagName = el.tagName.toLowerCase()

  // Check for fill attribute or style
  const fill = el.getAttribute('fill')
  const style = el.getAttribute('style') || ''
  const styleFillMatch = style.match(/fill:\s*([^;]+)/)

  let hasFill = false
  if (fill && fill !== 'none' && fill !== 'transparent') {
    hasFill = true
  }
  if (styleFillMatch && styleFillMatch[1] !== 'none' && styleFillMatch[1] !== 'transparent') {
    hasFill = true
  }

  // Check if it's a shape element with a fill
  if (hasFill && ['path', 'polygon', 'rect', 'circle', 'ellipse'].includes(tagName)) {
    // Check if this is a hatch fill (custom markup) - these are already strokes
    if (node.customMarkup) {
      return false
    }
    return true
  }

  // Recursively check children
  for (const child of node.children) {
    if (nodeHasFills(child)) {
      return true
    }
  }

  return false
}

// Extract all path data for progressive drawing
function extractDrawablePaths(svgElement: SVGSVGElement): { element: SVGElement; length: number }[] {
  const paths: { element: SVGElement; length: number }[] = []

  const collectPaths = (el: Element) => {
    const tagName = el.tagName.toLowerCase()

    if (tagName === 'path' || tagName === 'line' || tagName === 'polyline' || tagName === 'polygon') {
      // Check if it has a stroke (drawable)
      const stroke = el.getAttribute('stroke')
      const style = el.getAttribute('style') || ''
      const hasStroke = (stroke && stroke !== 'none') || (style.includes('stroke:') && !style.includes('stroke:none'))

      if (hasStroke) {
        let length = 0
        if (tagName === 'path' && el instanceof SVGPathElement) {
          try {
            length = el.getTotalLength()
          } catch {
            length = 100 // fallback
          }
        } else if (tagName === 'line') {
          const x1 = parseFloat(el.getAttribute('x1') || '0')
          const y1 = parseFloat(el.getAttribute('y1') || '0')
          const x2 = parseFloat(el.getAttribute('x2') || '0')
          const y2 = parseFloat(el.getAttribute('y2') || '0')
          length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
        } else {
          length = 100 // fallback for polyline/polygon
        }

        paths.push({ element: el as SVGElement, length })
      }
    }

    // Recurse into children
    for (const child of Array.from(el.children)) {
      collectPaths(child)
    }
  }

  collectPaths(svgElement)
  return paths
}

export default function ExportTab() {
  const { svgContent, svgDimensions, layerNodes, fileName, svgElementRef } = useAppContext()

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const playbackRef = useRef<number | null>(null)
  const [drawablePaths, setDrawablePaths] = useState<{ element: SVGElement; length: number }[]>([])
  const [hasFillsWarning, setHasFillsWarning] = useState(false)

  // Paper sizes state
  const [paperSizes, setPaperSizes] = useState<PaperSize[]>(loadPaperSizes)
  const [showPaperSizeSettings, setShowPaperSizeSettings] = useState(false)
  const [editingPaperSizes, setEditingPaperSizes] = useState<string>('')

  // Page setup state
  const [paperSize, setPaperSize] = useState<string>('a4')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [marginUniform, setMarginUniform] = useState(true)
  const [margins, setMargins] = useState({ top: 10, right: 10, bottom: 10, left: 10 })
  const [scaleToFit, setScaleToFit] = useState(true)
  const [clipToPage, setClipToPage] = useState(false)
  const [centerContent, setCenterContent] = useState(true)
  const [designInset, setDesignInset] = useState(0) // mm to crop into the design from each edge

  // Export options
  const [includeBackground, setIncludeBackground] = useState(false)
  const [normalizeStrokes, setNormalizeStrokes] = useState(false)
  const [strokeWidth, setStrokeWidth] = useState(1)
  const [convertFillsToStrokes, setConvertFillsToStrokes] = useState(false)

  // Preview canvas ref
  const previewRef = useRef<HTMLDivElement>(null)
  const [baseScale, setBaseScale] = useState(1) // Auto-calculated to fit
  const [userZoom, setUserZoom] = useState(1) // User-controlled zoom on top
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Combined preview scale
  const previewScale = baseScale * userZoom

  // Open paper size settings
  const handleOpenPaperSettings = () => {
    setEditingPaperSizes(JSON.stringify(paperSizes, null, 2))
    setShowPaperSizeSettings(true)
  }

  // Save paper size settings
  const handleSavePaperSettings = () => {
    try {
      const parsed = JSON.parse(editingPaperSizes)
      if (!Array.isArray(parsed)) {
        alert('Invalid format: must be an array of paper sizes')
        return
      }
      // Validate each entry
      for (const size of parsed) {
        if (!size.id || !size.label || typeof size.width !== 'number' || typeof size.height !== 'number') {
          alert('Invalid paper size entry. Each entry must have id, label, width, and height.')
          return
        }
      }
      setPaperSizes(parsed)
      savePaperSizes(parsed)
      setShowPaperSizeSettings(false)
    } catch (e) {
      alert('Invalid JSON format')
    }
  }

  // Reset to defaults
  const handleResetPaperSizes = () => {
    const defaults = defaultPaperSizes.paperSizes as PaperSize[]
    setEditingPaperSizes(JSON.stringify(defaults, null, 2))
  }

  // Calculate page dimensions based on paper size and orientation
  const pageDimensions = useMemo(() => {
    const size = paperSizes.find(s => s.id === paperSize)
    if (!size) return null

    const width = orientation === 'portrait' ? size.width : size.height
    const height = orientation === 'portrait' ? size.height : size.width

    return { width, height, widthPx: width * MM_TO_PX, heightPx: height * MM_TO_PX }
  }, [paperSize, orientation, paperSizes])

  // Calculate printable area and content transform
  const pageLayout = useMemo(() => {
    if (!pageDimensions || !svgDimensions) return null

    const printableWidth = pageDimensions.width - margins.left - margins.right
    const printableHeight = pageDimensions.height - margins.top - margins.bottom

    if (printableWidth <= 0 || printableHeight <= 0) return null

    // Apply design inset - this crops into the design from each edge
    // The inset is in mm, need to convert to content's coordinate space
    const insetPx = designInset * MM_TO_PX
    const croppedWidth = Math.max(1, svgDimensions.width - insetPx * 2)
    const croppedHeight = Math.max(1, svgDimensions.height - insetPx * 2)
    const croppedWidthMm = croppedWidth / MM_TO_PX
    const croppedHeightMm = croppedHeight / MM_TO_PX

    // Calculate scale to fit cropped content in printable area
    let scale = 1
    if (scaleToFit) {
      const scaleX = printableWidth / croppedWidthMm
      const scaleY = printableHeight / croppedHeightMm
      scale = Math.min(scaleX, scaleY) // Fit to printable area (can scale up or down)
    }

    const scaledWidth = croppedWidthMm * scale
    const scaledHeight = croppedHeightMm * scale

    // Calculate offset to center content in printable area
    let offsetX = margins.left
    let offsetY = margins.top

    if (centerContent) {
      offsetX = margins.left + (printableWidth - scaledWidth) / 2
      offsetY = margins.top + (printableHeight - scaledHeight) / 2
    }

    return {
      printableWidth,
      printableHeight,
      scale,
      scaledWidth,
      scaledHeight,
      offsetX,
      offsetY,
      // Store inset in px for transform calculation
      insetPx,
      croppedWidthMm,
      croppedHeightMm,
    }
  }, [pageDimensions, svgDimensions, margins, scaleToFit, centerContent, designInset])

  // Calculate base preview scale to fit the page in the preview area
  useEffect(() => {
    if (!previewRef.current || !pageDimensions) return

    const rect = previewRef.current.getBoundingClientRect()
    const padding = 40
    const availableWidth = rect.width - padding
    const availableHeight = rect.height - padding

    const scaleX = availableWidth / pageDimensions.widthPx
    const scaleY = availableHeight / pageDimensions.heightPx
    setBaseScale(Math.min(scaleX, scaleY, 1))
  }, [pageDimensions])

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setUserZoom(prev => Math.min(10, prev * 1.2))
  }, [])

  const handleZoomOut = useCallback(() => {
    setUserZoom(prev => Math.max(0.1, prev / 1.2))
  }, [])

  const handleFitToView = useCallback(() => {
    setUserZoom(1)
    setPanOffset({ x: 0, y: 0 })
  }, [])

  // Wheel zoom - use native event listener for passive: false
  useEffect(() => {
    const element = previewRef.current
    if (!element) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setUserZoom(prev => Math.max(0.1, Math.min(10, prev * delta)))
    }

    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [])

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y })
    }
  }, [panOffset])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Handle uniform margin change
  const handleUniformMarginChange = (value: number) => {
    setMargins({ top: value, right: value, bottom: value, left: value })
  }

  // Check for fills and extract drawable paths when SVG changes
  useEffect(() => {
    // Check if any layer has fills
    const hasFills = layerNodes.some(node => nodeHasFills(node))
    setHasFillsWarning(hasFills)

    // Extract paths for playback
    if (svgElementRef.current) {
      const paths = extractDrawablePaths(svgElementRef.current)
      setDrawablePaths(paths)
    }
  }, [layerNodes, svgElementRef, svgContent])

  // Playback control functions
  const handlePlay = useCallback(() => {
    if (hasFillsWarning) {
      alert('Warning: This SVG contains fill layers that won\'t be drawn by a pen plotter.\n\nPlease convert fills to strokes using the "Convert fills to strokes" option, or use the Fill tab to apply line fill patterns to shapes.')
      return
    }

    if (drawablePaths.length === 0) {
      alert('No drawable paths found. The SVG may not contain any stroked paths.')
      return
    }

    setIsPlaying(true)
    const startTime = performance.now()
    const duration = 10000 // 10 seconds for full playback
    const startProgress = playbackProgress

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(startProgress + (elapsed / duration) * (100 - startProgress), 100)
      setPlaybackProgress(progress)

      if (progress < 100) {
        playbackRef.current = requestAnimationFrame(animate)
      } else {
        setIsPlaying(false)
        playbackRef.current = null
      }
    }

    playbackRef.current = requestAnimationFrame(animate)
  }, [hasFillsWarning, drawablePaths, playbackProgress])

  const handlePause = useCallback(() => {
    setIsPlaying(false)
    if (playbackRef.current) {
      cancelAnimationFrame(playbackRef.current)
      playbackRef.current = null
    }
  }, [])

  const handleRestart = useCallback(() => {
    handlePause()
    setPlaybackProgress(0)
  }, [handlePause])

  const handleProgressChange = useCallback((value: number) => {
    handlePause()
    setPlaybackProgress(value)
  }, [handlePause])

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (playbackRef.current) {
        cancelAnimationFrame(playbackRef.current)
      }
    }
  }, [])

  // Calculate which paths should be visible based on progress
  const visiblePathCount = useMemo(() => {
    if (drawablePaths.length === 0) return 0
    return Math.floor((playbackProgress / 100) * drawablePaths.length)
  }, [playbackProgress, drawablePaths])

  const stats = useMemo(() => {
    if (!layerNodes.length) return null
    return analyzeSVG(layerNodes)
  }, [layerNodes])

  const svgSizeBytes = useMemo(() => {
    if (!svgContent) return 0
    return new Blob([svgContent]).size
  }, [svgContent])

  // Create preview SVG with export options applied
  const previewSvgContent = useMemo(() => {
    if (!svgContent) return ''
    if (!convertFillsToStrokes && !normalizeStrokes) return svgContent

    // Parse the SVG
    const parser = new DOMParser()
    const doc = parser.parseFromString(svgContent, 'image/svg+xml')
    const svg = doc.documentElement

    // Convert fills to strokes
    if (convertFillsToStrokes) {
      const elements = svg.querySelectorAll('path, polygon, rect, circle, ellipse')
      elements.forEach(el => {
        let fillColor = el.getAttribute('fill')
        const style = el.getAttribute('style') || ''

        const styleFillMatch = style.match(/fill:\s*([^;]+)/)
        if (styleFillMatch) {
          fillColor = styleFillMatch[1].trim()
        }

        if (fillColor && fillColor !== 'none' && fillColor !== 'transparent') {
          el.setAttribute('stroke', fillColor)
          el.setAttribute('fill', 'none')

          if (!el.getAttribute('stroke-width') && !style.includes('stroke-width')) {
            el.setAttribute('stroke-width', '1')
          }

          if (style.includes('fill:')) {
            const newStyle = style
              .replace(/fill:\s*[^;]+;?/g, 'fill:none;')
              .replace(/stroke:\s*[^;]+;?/g, '') + `stroke:${fillColor};`
            el.setAttribute('style', newStyle)
          }
        }
      })
    }

    // Normalize stroke widths
    if (normalizeStrokes) {
      const elements = svg.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse')
      elements.forEach(el => {
        const currentStroke = el.getAttribute('stroke')
        if (currentStroke && currentStroke !== 'none') {
          el.setAttribute('stroke-width', String(strokeWidth))
        }
        const style = el.getAttribute('style')
        if (style && style.includes('stroke:') && !style.includes('stroke:none')) {
          const newStyle = style.replace(/stroke-width:\s*[^;]+;?/g, '') + `stroke-width:${strokeWidth}px;`
          el.setAttribute('style', newStyle)
        }
      })
    }

    return new XMLSerializer().serializeToString(svg)
  }, [svgContent, convertFillsToStrokes, normalizeStrokes, strokeWidth])

  if (!svgContent) {
    return (
      <div className="export-tab empty-state">
        <div className="empty-content">
          <h3>No SVG Loaded</h3>
          <p>Go to the Sort tab and upload an SVG to see analysis and export options.</p>
        </div>
      </div>
    )
  }

  const handleExport = () => {
    // Use the live SVG element from the DOM (includes all modifications like hatching)
    if (!svgElementRef.current || !pageDimensions || !pageLayout) return

    // Clone the SVG element to avoid modifying the original
    const originalSvg = svgElementRef.current.cloneNode(true) as SVGSVGElement
    if (!originalSvg) return

    // Create a new SVG with the page dimensions
    const svgNS = 'http://www.w3.org/2000/svg'
    const newSvg = document.createElementNS(svgNS, 'svg')

    // Set page dimensions in mm
    newSvg.setAttribute('width', `${pageDimensions.width}mm`)
    newSvg.setAttribute('height', `${pageDimensions.height}mm`)
    newSvg.setAttribute('viewBox', `0 0 ${pageDimensions.width} ${pageDimensions.height}`)
    newSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    // Add white background if requested
    if (includeBackground) {
      const bgRect = document.createElementNS(svgNS, 'rect')
      bgRect.setAttribute('width', '100%')
      bgRect.setAttribute('height', '100%')
      bgRect.setAttribute('fill', 'white')
      newSvg.appendChild(bgRect)
    }

    // Add clipping path if clipping is enabled
    if (clipToPage) {
      const defs = document.createElementNS(svgNS, 'defs')
      const clipPath = document.createElementNS(svgNS, 'clipPath')
      clipPath.setAttribute('id', 'page-clip')
      const clipRect = document.createElementNS(svgNS, 'rect')
      clipRect.setAttribute('x', String(margins.left))
      clipRect.setAttribute('y', String(margins.top))
      clipRect.setAttribute('width', String(pageLayout.printableWidth))
      clipRect.setAttribute('height', String(pageLayout.printableHeight))
      clipPath.appendChild(clipRect)
      defs.appendChild(clipPath)
      newSvg.appendChild(defs)
    }

    // Create a group to hold the transformed content
    const contentGroup = document.createElementNS(svgNS, 'g')

    // Apply clipping if enabled
    if (clipToPage) {
      contentGroup.setAttribute('clip-path', 'url(#page-clip)')
    }

    // Create inner group for transform
    const transformGroup = document.createElementNS(svgNS, 'g')

    // The transform needs to:
    // 1. Offset by the inset (crop into design) - in original SVG px coordinates
    // 2. Scale from px to mm, applying the fit scale
    // 3. Translate to the correct position on the page

    // Combined scale: px to mm conversion * fit scale
    const combinedScale = (1 / MM_TO_PX) * pageLayout.scale

    // The inset shifts the content origin (in px, before scaling)
    // After scaling, we translate to page position (in mm)
    transformGroup.setAttribute(
      'transform',
      `translate(${pageLayout.offsetX}, ${pageLayout.offsetY}) scale(${combinedScale}) translate(${-pageLayout.insetPx}, ${-pageLayout.insetPx})`
    )

    // Convert fills to strokes if requested (for pen plotters)
    if (convertFillsToStrokes) {
      const elements = originalSvg.querySelectorAll('path, polygon, rect, circle, ellipse')
      elements.forEach(el => {
        // Get fill color from attribute or style
        let fillColor = el.getAttribute('fill')
        const style = el.getAttribute('style') || ''

        // Check style for fill
        const styleFillMatch = style.match(/fill:\s*([^;]+)/)
        if (styleFillMatch) {
          fillColor = styleFillMatch[1].trim()
        }

        // If there's a valid fill color (not none/transparent), convert to stroke
        if (fillColor && fillColor !== 'none' && fillColor !== 'transparent') {
          // Set stroke to the fill color
          el.setAttribute('stroke', fillColor)

          // Set fill to none
          el.setAttribute('fill', 'none')

          // If no stroke-width set, use a default
          if (!el.getAttribute('stroke-width') && !style.includes('stroke-width')) {
            el.setAttribute('stroke-width', '1')
          }

          // Update style attribute if it has fill
          if (style.includes('fill:')) {
            const newStyle = style
              .replace(/fill:\s*[^;]+;?/g, 'fill:none;')
              .replace(/stroke:\s*[^;]+;?/g, '') + `stroke:${fillColor};`
            el.setAttribute('style', newStyle)
          }
        }
      })
    }

    // Normalize stroke widths if requested
    if (normalizeStrokes) {
      const elements = originalSvg.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse')
      elements.forEach(el => {
        const currentStroke = el.getAttribute('stroke')
        if (currentStroke && currentStroke !== 'none') {
          el.setAttribute('stroke-width', String(strokeWidth))
        }
        // Also check style attribute
        const style = el.getAttribute('style')
        if (style && style.includes('stroke:') && !style.includes('stroke:none')) {
          const newStyle = style.replace(/stroke-width:\s*[^;]+;?/g, '') + `stroke-width:${strokeWidth}px;`
          el.setAttribute('style', newStyle)
        }
      })
    }

    // Move all children from original SVG to transform group
    while (originalSvg.firstChild) {
      transformGroup.appendChild(originalSvg.firstChild)
    }

    contentGroup.appendChild(transformGroup)
    newSvg.appendChild(contentGroup)

    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(newSvg)

    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName?.replace('.svg', '-export.svg') || 'export.svg'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="export-tab">
      <aside className="export-sidebar">
        <div className="sidebar-header">
          <h2>Page Setup</h2>
        </div>
        <div className="sidebar-content">
          {/* Page Size Section */}
          <div className="export-section">
            <h3 className="section-header-with-action">
              <span>Page Size</span>
              <button
                className="settings-icon-btn"
                onClick={handleOpenPaperSettings}
                title="Edit paper sizes"
              >
                ⚙
              </button>
            </h3>

            <div className="export-control">
              <label>Paper</label>
              <select
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value)}
                className="export-select"
              >
                {paperSizes.map((size) => (
                  <option key={size.id} value={size.id}>{size.label}</option>
                ))}
              </select>
            </div>

            <div className="export-control">
              <label>Orientation</label>
              <div className="orientation-toggle">
                <button
                  className={`orientation-btn ${orientation === 'portrait' ? 'active' : ''}`}
                  onClick={() => setOrientation('portrait')}
                  title="Portrait"
                >
                  <span className="orientation-icon portrait">▯</span>
                  Portrait
                </button>
                <button
                  className={`orientation-btn ${orientation === 'landscape' ? 'active' : ''}`}
                  onClick={() => setOrientation('landscape')}
                  title="Landscape"
                >
                  <span className="orientation-icon landscape">▭</span>
                  Landscape
                </button>
              </div>
            </div>

            {pageDimensions && (
              <div className="page-dimensions-info">
                {pageDimensions.width.toFixed(0)} × {pageDimensions.height.toFixed(0)} mm
              </div>
            )}
          </div>

          {/* Margins Section */}
          <div className="export-section">
            <h3>Margins</h3>

            <div className="export-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={marginUniform}
                  onChange={(e) => setMarginUniform(e.target.checked)}
                />
                Uniform margins
              </label>
            </div>

            {marginUniform ? (
              <div className="export-control">
                <label>All sides (mm)</label>
                <div className="control-row">
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={margins.top}
                    onChange={(e) => handleUniformMarginChange(Number(e.target.value))}
                    className="export-slider"
                  />
                  <span className="control-value">{margins.top}mm</span>
                </div>
              </div>
            ) : (
              <div className="margin-controls">
                <div className="export-control compact">
                  <label>Top</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={margins.top}
                    onChange={(e) => setMargins({ ...margins, top: Number(e.target.value) })}
                    className="margin-input"
                  />
                  <span className="unit">mm</span>
                </div>
                <div className="export-control compact">
                  <label>Right</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={margins.right}
                    onChange={(e) => setMargins({ ...margins, right: Number(e.target.value) })}
                    className="margin-input"
                  />
                  <span className="unit">mm</span>
                </div>
                <div className="export-control compact">
                  <label>Bottom</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={margins.bottom}
                    onChange={(e) => setMargins({ ...margins, bottom: Number(e.target.value) })}
                    className="margin-input"
                  />
                  <span className="unit">mm</span>
                </div>
                <div className="export-control compact">
                  <label>Left</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={margins.left}
                    onChange={(e) => setMargins({ ...margins, left: Number(e.target.value) })}
                    className="margin-input"
                  />
                  <span className="unit">mm</span>
                </div>
              </div>
            )}
          </div>

          {/* Layout Options Section */}
          <div className="export-section">
            <h3>Layout</h3>

            <div className="export-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={scaleToFit}
                  onChange={(e) => setScaleToFit(e.target.checked)}
                />
                Scale to fit page
              </label>
            </div>

            <div className="export-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={centerContent}
                  onChange={(e) => setCenterContent(e.target.checked)}
                />
                Center content
              </label>
            </div>

            <div className="export-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={clipToPage}
                  onChange={(e) => setClipToPage(e.target.checked)}
                />
                Clip to margins
              </label>
            </div>

            <div className="export-control">
              <label>Design Inset (mm)</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="1"
                  value={designInset}
                  onChange={(e) => setDesignInset(Number(e.target.value))}
                  className="export-slider"
                />
                <span className="control-value">{designInset}mm</span>
              </div>
              <p className="control-hint">Crops into the design from each edge</p>
            </div>

            {pageLayout && (
              <div className="layout-info">
                <div className="info-item small">
                  <span>Scale:</span>
                  <span>{(pageLayout.scale * 100).toFixed(1)}%</span>
                </div>
                <div className="info-item small">
                  <span>Output size:</span>
                  <span>{pageLayout.scaledWidth.toFixed(1)} × {pageLayout.scaledHeight.toFixed(1)} mm</span>
                </div>
              </div>
            )}
          </div>

          {/* Other Options Section */}
          <div className="export-section">
            <h3>Other Options</h3>

            <div className="export-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={includeBackground}
                  onChange={(e) => setIncludeBackground(e.target.checked)}
                />
                Include white background
              </label>
            </div>

            <div className="export-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={convertFillsToStrokes}
                  onChange={(e) => setConvertFillsToStrokes(e.target.checked)}
                />
                Convert fills to strokes
              </label>
            </div>

            <div className="export-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={normalizeStrokes}
                  onChange={(e) => setNormalizeStrokes(e.target.checked)}
                />
                Normalize stroke widths
              </label>
            </div>

            {normalizeStrokes && (
              <div className="export-control">
                <label>Stroke Width (px)</label>
                <div className="control-row">
                  <input
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.5"
                    value={strokeWidth}
                    onChange={(e) => setStrokeWidth(Number(e.target.value))}
                    className="export-slider"
                  />
                  <span className="control-value">{strokeWidth}px</span>
                </div>
              </div>
            )}
          </div>

          <div className="export-actions">
            <button className="export-btn primary" onClick={handleExport}>
              Export SVG
            </button>
          </div>
        </div>
      </aside>

      {/* Preview Area */}
      <div
        className="export-preview"
        ref={previewRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="preview-header">
          <h2>Page Preview</h2>
          <div className="playback-controls">
            <button
              className="playback-btn"
              onClick={handleRestart}
              title="Restart"
              disabled={playbackProgress === 0}
            >
              ⏮
            </button>
            <button
              className={`playback-btn ${isPlaying ? 'active' : ''}`}
              onClick={isPlaying ? handlePause : handlePlay}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <input
              type="range"
              className="playback-slider"
              min="0"
              max="100"
              step="0.1"
              value={playbackProgress}
              onChange={(e) => handleProgressChange(Number(e.target.value))}
              title={`${playbackProgress.toFixed(0)}% - ${visiblePathCount} of ${drawablePaths.length} paths`}
            />
            <span className="playback-info">
              {visiblePathCount}/{drawablePaths.length}
            </span>
            {hasFillsWarning && (
              <span className="fills-warning" title="SVG contains fills that need to be converted to strokes">
                ⚠
              </span>
            )}
          </div>
          <div className="preview-zoom-controls">
            <button onClick={handleZoomIn} title="Zoom In">+</button>
            <button onClick={handleZoomOut} title="Zoom Out">-</button>
            <button onClick={handleFitToView} title="Fit to View">Fit</button>
            <span className="zoom-level">{Math.round(userZoom * 100)}%</span>
          </div>
        </div>
        <div className="preview-content" style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
          {pageDimensions && pageLayout && svgContent && (
            <div
              className="page-preview"
              style={{
                width: pageDimensions.widthPx * previewScale,
                height: pageDimensions.heightPx * previewScale,
                transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              }}
            >
              {/* Page background */}
              <div className="page-paper" />

              {/* Margin indicators */}
              <div
                className="margin-area"
                style={{
                  top: margins.top * MM_TO_PX * previewScale,
                  right: margins.right * MM_TO_PX * previewScale,
                  bottom: margins.bottom * MM_TO_PX * previewScale,
                  left: margins.left * MM_TO_PX * previewScale,
                }}
              />

              {/* Content preview - with clipping if enabled */}
              <div
                className={`content-preview ${clipToPage ? 'clipped' : ''}`}
                style={{
                  left: pageLayout.offsetX * MM_TO_PX * previewScale,
                  top: pageLayout.offsetY * MM_TO_PX * previewScale,
                  width: pageLayout.scaledWidth * MM_TO_PX * previewScale,
                  height: pageLayout.scaledHeight * MM_TO_PX * previewScale,
                  overflow: clipToPage ? 'hidden' : 'visible',
                }}
              >
                <div
                  className="content-inner"
                  dangerouslySetInnerHTML={{ __html: previewSvgContent }}
                  style={{
                    // Apply inset by shifting the content, then scale
                    transform: `scale(${pageLayout.scale * previewScale}) translate(${-pageLayout.insetPx}px, ${-pageLayout.insetPx}px)`,
                    transformOrigin: 'top left',
                  }}
                />
              </div>
            </div>
          )}

          {!svgContent && (
            <div className="preview-empty">
              <p>Load an SVG to see preview</p>
            </div>
          )}
        </div>
      </div>

      {/* Analysis Panel */}
      <aside className="export-analysis">
        <div className="analysis-container">
          <h2>SVG Analysis</h2>

          {/* Top row: Document Info & Dimensions, Content Statistics */}
          <div className="analysis-top-row">
            {/* Document Info & Dimensions */}
            <section className="analysis-section compact">
              <h3>Document</h3>
              <div className="info-list">
                <div className="info-item">
                  <span className="info-label">File Name</span>
                  <span className="info-value">{fileName || 'Untitled'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">File Size</span>
                  <span className="info-value">{formatBytes(svgSizeBytes)}</span>
                </div>
                {svgDimensions && (
                  <>
                    <div className="info-item">
                      <span className="info-label">Pixels</span>
                      <span className="info-value">
                        {svgDimensions.width.toFixed(0)} × {svgDimensions.height.toFixed(0)} px
                      </span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Inches (96 DPI)</span>
                      <span className="info-value">
                        {(svgDimensions.width / 96).toFixed(2)} × {(svgDimensions.height / 96).toFixed(2)}"
                      </span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Millimeters</span>
                      <span className="info-value">
                        {(svgDimensions.width / 3.78).toFixed(1)} × {(svgDimensions.height / 3.78).toFixed(1)} mm
                      </span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Aspect Ratio</span>
                      <span className="info-value">
                        {(svgDimensions.width / svgDimensions.height).toFixed(3)}:1
                      </span>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Content Statistics */}
            {stats && (
              <section className="analysis-section compact">
                <h3>Content Statistics</h3>
                <div className="info-list">
                  <div className="info-item">
                    <span className="info-label">Total Elements</span>
                    <span className="info-value">{stats.totalNodes.toLocaleString()}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Groups</span>
                    <span className="info-value">{stats.totalGroups.toLocaleString()}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Paths</span>
                    <span className="info-value">{stats.totalPaths.toLocaleString()}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Shapes</span>
                    <span className="info-value">{stats.totalShapes.toLocaleString()}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Max Nesting Depth</span>
                    <span className="info-value">{stats.maxDepth}</span>
                  </div>
                </div>
              </section>
            )}
          </div>

          {stats && (
            <>
              {/* Path Operations & Color Palette row */}
              <div className="analysis-middle-row">
                {/* Path Operations */}
                {Object.keys(stats.operationCounts).length > 0 && (
                  <section className="analysis-section compact">
                    <h3>Path Operations</h3>
                    <div className="operations-list">
                      {Object.entries(stats.operationCounts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([cmd, count]) => (
                          <div key={cmd} className="operation-item">
                            <span className="operation-cmd">{cmd}</span>
                            <span className="operation-name">{COMMAND_NAMES[cmd] || cmd}</span>
                            <span className="operation-count">{count.toLocaleString()}</span>
                          </div>
                        ))}
                    </div>
                    <div className="operations-total">
                      Total: {Object.values(stats.operationCounts).reduce((a, b) => a + b, 0).toLocaleString()} operations
                    </div>
                  </section>
                )}

                {/* Color Palette */}
                {stats.colorPalette.length > 0 && (
                  <section className="analysis-section compact">
                    <h3>Color Palette ({stats.colorPalette.length} colors)</h3>
                    <div className="color-palette">
                      {stats.colorPalette.map((color, index) => (
                        <div key={index} className="color-item" title={color}>
                          <span
                            className="color-swatch"
                            style={{ backgroundColor: color }}
                          />
                          <span className="color-value">{color}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {/* Layer Summary */}
              {stats.layerStats.length > 0 && (
                <section className="analysis-section">
                  <h3>Layer Summary ({stats.layerStats.length} groups)</h3>
                  <div className="layer-summary">
                    {stats.layerStats.slice(0, 20).map((layer, index) => (
                      <div key={index} className="layer-summary-item">
                        <span
                          className="layer-name"
                          style={{ paddingLeft: `${layer.depth * 12}px` }}
                        >
                          {layer.name}
                        </span>
                        <div className="layer-info">
                          {layer.colors.length > 0 && (
                            <div className="layer-colors">
                              {layer.colors.slice(0, 5).map((color, colorIndex) => (
                                <span
                                  key={colorIndex}
                                  className="layer-color-swatch"
                                  style={{ backgroundColor: color }}
                                  title={color}
                                />
                              ))}
                              {layer.colors.length > 5 && (
                                <span className="layer-colors-more">+{layer.colors.length - 5}</span>
                              )}
                            </div>
                          )}
                          <span className="layer-paths">{layer.paths} paths</span>
                        </div>
                      </div>
                    ))}
                    {stats.layerStats.length > 20 && (
                      <div className="layer-summary-more">
                        ... and {stats.layerStats.length - 20} more groups
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Paper Size Settings Modal */}
      {showPaperSizeSettings && (
        <div className="modal-overlay" onClick={() => setShowPaperSizeSettings(false)}>
          <div className="modal-content paper-settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Paper Sizes</h2>
              <button
                className="modal-close"
                onClick={() => setShowPaperSizeSettings(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-hint">
                Edit the JSON below to add, remove, or modify paper sizes.
                Each size needs: <code>id</code>, <code>label</code>, <code>width</code>, <code>height</code> (in mm).
              </p>
              <textarea
                className="paper-sizes-editor"
                value={editingPaperSizes}
                onChange={(e) => setEditingPaperSizes(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="modal-footer">
              <button
                className="modal-btn secondary"
                onClick={handleResetPaperSizes}
              >
                Reset to Defaults
              </button>
              <div className="modal-footer-right">
                <button
                  className="modal-btn"
                  onClick={() => setShowPaperSizeSettings(false)}
                >
                  Cancel
                </button>
                <button
                  className="modal-btn primary"
                  onClick={handleSavePaperSettings}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
