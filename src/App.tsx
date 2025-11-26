import './App.css'
import { AppProvider, useAppContext } from './context/AppContext'
import TabNavigation from './components/TabNavigation'
import { SortTab, FillTab, ExportTab } from './components/tabs'
import { SVGNode } from './types/svg'

function AppContent() {
  const {
    activeTab,
    svgContent,
    scale,
    setScale,
    setOffset,
    showCrop,
    setShowCrop,
    flattenArmed,
    setFlattenArmed,
    setCropArmed,
    setStatusMessage,
    layerNodes,
    setLayerNodes,
    setSelectedNodeIds,
  } = useAppContext()

  const handleZoomIn = () => {
    setScale(Math.min(10, scale * 1.2))
  }

  const handleZoomOut = () => {
    setScale(Math.max(0.1, scale / 1.2))
  }

  const handleFitToScreen = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  const disarmActions = () => {
    setFlattenArmed(false)
    setCropArmed(false)
    setStatusMessage('')
  }

  const handleFlattenAll = () => {
    if (!flattenArmed) {
      setFlattenArmed(true)
      setCropArmed(false)
      setStatusMessage('Click Flatten again to confirm')
      return
    }

    setFlattenArmed(false)
    setStatusMessage('')

    const getElementColor = (element: Element): string | null => {
      const fill = element.getAttribute('fill')
      const stroke = element.getAttribute('stroke')
      const style = element.getAttribute('style')

      if (style) {
        const fillMatch = style.match(/fill:\s*([^;]+)/)
        const strokeMatch = style.match(/stroke:\s*([^;]+)/)
        if (fillMatch && fillMatch[1] !== 'none') return fillMatch[1].trim()
        if (strokeMatch && strokeMatch[1] !== 'none') return strokeMatch[1].trim()
      }

      if (fill && fill !== 'none' && fill !== 'transparent') return fill
      if (stroke && stroke !== 'none' && stroke !== 'transparent') return stroke

      return null
    }

    const deleteEmptyLayers = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.filter(node => {
        if (node.isGroup && node.children.length === 0) {
          node.element.remove()
          return false
        }
        if (node.children.length > 0) {
          node.children = deleteEmptyLayers(node.children)
          if (node.isGroup && node.children.length === 0) {
            node.element.remove()
            return false
          }
        }
        return true
      })
    }

    const ungroupAll = (nodes: SVGNode[]): SVGNode[] => {
      let result: SVGNode[] = []

      for (const node of nodes) {
        if (node.isGroup && node.children.length > 0) {
          const parent = node.element.parentElement
          if (parent) {
            const ungroupedChildren = ungroupAll(node.children)

            for (const child of ungroupedChildren) {
              parent.insertBefore(child.element, node.element)
              result.push(child)
            }

            node.element.remove()
          }
        } else if (!node.isGroup) {
          result.push(node)
        }
      }

      return result
    }

    const groupByColor = (nodes: SVGNode[]): SVGNode[] => {
      const colorGroups = new Map<string, SVGNode[]>()
      nodes.forEach(node => {
        const color = getElementColor(node.element) || 'no-color'
        if (!colorGroups.has(color)) {
          colorGroups.set(color, [])
        }
        colorGroups.get(color)!.push(node)
      })

      if (colorGroups.size <= 1) return nodes

      const svgElement = document.querySelector('.canvas-content svg')
      if (!svgElement) return nodes

      const newNodes: SVGNode[] = []
      colorGroups.forEach((groupNodes, color) => {
        if (groupNodes.length === 1) {
          newNodes.push(groupNodes[0])
        } else {
          const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
          const groupId = `color-group-${color.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          newGroup.setAttribute('id', groupId)

          groupNodes.forEach(node => {
            newGroup.appendChild(node.element)
          })

          svgElement.appendChild(newGroup)

          const groupNode: SVGNode = {
            id: groupId,
            type: 'g',
            name: `color-${color}`,
            element: newGroup,
            isGroup: true,
            children: groupNodes
          }

          newNodes.push(groupNode)
        }
      })

      return newNodes
    }

    let processedNodes = [...layerNodes]

    processedNodes = deleteEmptyLayers(processedNodes)
    processedNodes = ungroupAll(processedNodes)
    processedNodes = groupByColor(processedNodes)

    setLayerNodes(processedNodes)
    setSelectedNodeIds(new Set())
  }

  const handleToggleCrop = () => {
    disarmActions()
    setShowCrop(!showCrop)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-icon">📐</span>
          <h1>SVG Grouper</h1>
        </div>
        <TabNavigation />
        {svgContent && (
          <div className="header-right-controls">
            <div className="header-function-buttons">
              <button
                onClick={handleFlattenAll}
                className="function-button"
                title={flattenArmed ? "Click again to confirm flatten" : "Flatten: Remove empty layers, ungroup all, group by color"}
                style={{
                  background: flattenArmed ? '#e67e22' : '#3498db',
                  borderColor: flattenArmed ? '#e67e22' : '#3498db',
                }}
              >
                🗄️ Flatten
              </button>
              <button
                className="function-button"
                onClick={handleToggleCrop}
                title={showCrop ? "Hide Crop" : "Show Crop"}
                style={{
                  background: showCrop ? '#e74c3c' : '#e67e22',
                }}
              >
                {showCrop ? '✕ Crop' : '◯ Crop'}
              </button>
            </div>
            <div className="header-zoom-controls">
              <button onClick={handleZoomIn} title="Zoom In">+</button>
              <button onClick={handleZoomOut} title="Zoom Out">-</button>
              <button onClick={handleFitToScreen} title="Fit to Screen">Fit</button>
              <span className="zoom-level">{Math.round(scale * 100)}%</span>
            </div>
          </div>
        )}
      </header>
      <div className="app-content">
        {activeTab === 'sort' && <SortTab />}
        {activeTab === 'fill' && <FillTab />}
        {activeTab === 'export' && <ExportTab />}
      </div>
    </div>
  )
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

export default App
