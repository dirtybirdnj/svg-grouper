import { useState, useMemo } from 'react'
import { useAppContext } from '../../context/AppContext'
import { SVGNode } from '../../types/svg'
import './ExportTab.css'

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

export default function ExportTab() {
  const { svgContent, svgDimensions, layerNodes, fileName } = useAppContext()
  const [paperSize, setPaperSize] = useState('original')
  const [includeBackground, setIncludeBackground] = useState(false)
  const [normalizeStrokes, setNormalizeStrokes] = useState(false)
  const [strokeWidth, setStrokeWidth] = useState(1)

  const stats = useMemo(() => {
    if (!layerNodes.length) return null
    return analyzeSVG(layerNodes)
  }, [layerNodes])

  const svgSizeBytes = useMemo(() => {
    if (!svgContent) return 0
    return new Blob([svgContent]).size
  }, [svgContent])

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
    const svgElement = document.querySelector('.canvas-content svg')
    if (!svgElement) return

    const serializer = new XMLSerializer()
    let svgString = serializer.serializeToString(svgElement)

    // TODO: Apply export options (paper size, background, stroke normalization)

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
          <h2>Export Options</h2>
        </div>
        <div className="sidebar-content">
          <div className="export-section">
            <h3>Output Settings</h3>

            <div className="export-control">
              <label>Paper Size</label>
              <select
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value)}
                className="export-select"
              >
                <option value="original">Original Size</option>
                <option value="letter">Letter (8.5" × 11")</option>
                <option value="legal">Legal (8.5" × 14")</option>
                <option value="tabloid">Tabloid (11" × 17")</option>
                <option value="a4">A4 (210mm × 297mm)</option>
                <option value="a3">A3 (297mm × 420mm)</option>
                <option value="a2">A2 (420mm × 594mm)</option>
                <option value="a1">A1 (594mm × 841mm)</option>
              </select>
            </div>

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
              💾 Export SVG
            </button>
          </div>
        </div>
      </aside>

      <main className="export-main">
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
      </main>
    </div>
  )
}
