import { useState, useMemo, useRef } from 'react'
import { useAppContext } from '../../context/AppContext'
import { SVGNode } from '../../types/svg'
import './FillTab.css'

interface FillPathInfo {
  id: string
  type: string
  color: string
  pathData: string
  element: Element
}

export default function FillTab() {
  const {
    svgContent,
    layerNodes,
    fillTargetNodeId,
    setFillTargetNodeId,
    setActiveTab,
  } = useAppContext()

  const [lineSpacing, setLineSpacing] = useState(5)
  const [angle, setAngle] = useState(45)
  const [crossHatch, setCrossHatch] = useState(false)
  const [inset, setInset] = useState(0)
  const [retainStrokes, setRetainStrokes] = useState(true)

  const previewRef = useRef<HTMLDivElement>(null)

  // Find the target node
  const targetNode = useMemo(() => {
    if (!fillTargetNodeId) return null

    const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }

    return findNode(layerNodes, fillTargetNodeId)
  }, [layerNodes, fillTargetNodeId])

  // Extract all fill paths from the target node (including nested children)
  const fillPaths = useMemo(() => {
    if (!targetNode) return []

    const paths: FillPathInfo[] = []

    const getElementFill = (element: Element): string | null => {
      const fill = element.getAttribute('fill')
      const style = element.getAttribute('style')

      if (style) {
        const fillMatch = style.match(/fill:\s*([^;]+)/)
        if (fillMatch && fillMatch[1] !== 'none' && fillMatch[1] !== 'transparent') {
          return fillMatch[1].trim()
        }
      }

      if (fill && fill !== 'none' && fill !== 'transparent') {
        return fill
      }

      return null
    }

    const extractFillPaths = (node: SVGNode) => {
      const element = node.element
      const fill = getElementFill(element)

      // Only include actual shape elements with fills (not groups)
      if (fill && !node.isGroup) {
        const tagName = element.tagName.toLowerCase()
        let pathData = ''

        // Get path data based on element type
        if (tagName === 'path') {
          pathData = element.getAttribute('d') || ''
        } else if (tagName === 'rect') {
          const x = element.getAttribute('x') || '0'
          const y = element.getAttribute('y') || '0'
          const w = element.getAttribute('width') || '0'
          const h = element.getAttribute('height') || '0'
          pathData = `rect(${x}, ${y}, ${w}, ${h})`
        } else if (tagName === 'circle') {
          const cx = element.getAttribute('cx') || '0'
          const cy = element.getAttribute('cy') || '0'
          const r = element.getAttribute('r') || '0'
          pathData = `circle(${cx}, ${cy}, r=${r})`
        } else if (tagName === 'ellipse') {
          const cx = element.getAttribute('cx') || '0'
          const cy = element.getAttribute('cy') || '0'
          const rx = element.getAttribute('rx') || '0'
          const ry = element.getAttribute('ry') || '0'
          pathData = `ellipse(${cx}, ${cy}, ${rx}, ${ry})`
        } else if (tagName === 'polygon') {
          pathData = element.getAttribute('points') || ''
        }

        paths.push({
          id: node.id,
          type: tagName,
          color: fill,
          pathData,
          element,
        })
      }

      // Recursively process children
      for (const child of node.children) {
        extractFillPaths(child)
      }
    }

    extractFillPaths(targetNode)
    return paths
  }, [targetNode])

  // Calculate bounding box of all fill paths
  const boundingBox = useMemo(() => {
    if (fillPaths.length === 0) return null

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    fillPaths.forEach(path => {
      try {
        const bbox = (path.element as SVGGraphicsElement).getBBox?.()
        if (bbox) {
          minX = Math.min(minX, bbox.x)
          minY = Math.min(minY, bbox.y)
          maxX = Math.max(maxX, bbox.x + bbox.width)
          maxY = Math.max(maxY, bbox.y + bbox.height)
        }
      } catch {
        // getBBox can fail if element isn't rendered
      }
    })

    if (minX === Infinity) return null

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
  }, [fillPaths])

  // Generate preview SVG content
  const previewSvg = useMemo(() => {
    if (fillPaths.length === 0 || !boundingBox) return null

    const padding = 20
    const viewBox = `${boundingBox.x - padding} ${boundingBox.y - padding} ${boundingBox.width + padding * 2} ${boundingBox.height + padding * 2}`

    // Clone elements for preview
    const pathElements = fillPaths.map(path => {
      const el = path.element.cloneNode(true) as Element
      // Convert fill to stroke for preview (shows outline)
      el.setAttribute('fill', path.color)
      el.setAttribute('fill-opacity', '0.3')
      el.setAttribute('stroke', path.color)
      el.setAttribute('stroke-width', '2')
      return el.outerHTML
    }).join('\n')

    return { viewBox, pathElements }
  }, [fillPaths, boundingBox])

  const handleBack = () => {
    setFillTargetNodeId(null)
    setActiveTab('sort')
  }

  if (!svgContent) {
    return (
      <div className="fill-tab empty-state">
        <div className="empty-content">
          <h3>No SVG Loaded</h3>
          <p>Go to the Sort tab and upload an SVG to use line fill features.</p>
        </div>
      </div>
    )
  }

  if (!fillTargetNodeId || !targetNode) {
    return (
      <div className="fill-tab empty-state">
        <div className="empty-content">
          <h3>No Layer Selected</h3>
          <p>Go to the Sort tab, select a layer with fills, and click the Fill button.</p>
          <button className="back-button" onClick={handleBack}>
            ← Back to Sort
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fill-tab">
      <aside className="fill-sidebar">
        <div className="sidebar-header">
          <button className="back-link" onClick={handleBack}>
            ← Back
          </button>
          <h2>Line Fill</h2>
        </div>
        <div className="sidebar-content">
          <div className="fill-section">
            <h3>Target Layer</h3>
            <div className="target-layer-info">
              <span className="target-layer-name">{targetNode.name || targetNode.id}</span>
              {targetNode.isGroup && (
                <span className="target-layer-type">Group</span>
              )}
            </div>
          </div>

          <div className="fill-section">
            <h3>Fill Paths ({fillPaths.length})</h3>
            <div className="fill-paths-list">
              {fillPaths.map((path, index) => (
                <div key={path.id} className="fill-path-item">
                  <span
                    className="path-color-swatch"
                    style={{ backgroundColor: path.color }}
                  />
                  <span className="path-info">
                    <span className="path-type">{path.type}</span>
                    <span className="path-id">{path.id || `path-${index + 1}`}</span>
                  </span>
                </div>
              ))}
              {fillPaths.length === 0 && (
                <div className="no-paths-message">
                  No fill paths found in selection
                </div>
              )}
            </div>
          </div>

          <div className="fill-section">
            <h3>Pattern Settings</h3>

            <div className="fill-control">
              <label>Line Spacing</label>
              <div className="control-row">
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={lineSpacing}
                  onChange={(e) => setLineSpacing(Number(e.target.value))}
                  className="fill-slider"
                />
                <span className="control-value">{lineSpacing}px</span>
              </div>
            </div>

            <div className="fill-control">
              <label>Angle</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="180"
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  className="fill-slider"
                />
                <span className="control-value">{angle}°</span>
              </div>
            </div>

            <div className="fill-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={crossHatch}
                  onChange={(e) => setCrossHatch(e.target.checked)}
                />
                Cross-hatch
              </label>
            </div>

            <div className="fill-control">
              <label>Inset</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={inset}
                  onChange={(e) => setInset(Number(e.target.value))}
                  className="fill-slider"
                />
                <span className="control-value">{inset}px</span>
              </div>
            </div>

            <div className="fill-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={retainStrokes}
                  onChange={(e) => setRetainStrokes(e.target.checked)}
                />
                Retain strokes (edge outlines)
              </label>
            </div>
          </div>

          <div className="fill-actions">
            <button className="fill-preview-btn" disabled={fillPaths.length === 0}>
              Preview
            </button>
            <button className="fill-apply-btn" disabled={fillPaths.length === 0}>
              Apply Fill
            </button>
          </div>
        </div>
      </aside>

      <main className="fill-main" ref={previewRef}>
        {previewSvg ? (
          <div className="fill-preview-container">
            <svg
              className="fill-preview-svg"
              viewBox={previewSvg.viewBox}
              preserveAspectRatio="xMidYMid meet"
              dangerouslySetInnerHTML={{ __html: previewSvg.pathElements }}
            />
          </div>
        ) : (
          <div className="fill-preview-empty">
            <p>No geometry to preview</p>
          </div>
        )}
      </main>
    </div>
  )
}
