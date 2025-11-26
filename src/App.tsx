import './App.css'
import { AppProvider, useAppContext } from './context/AppContext'
import TabNavigation from './components/TabNavigation'
import { SortTab, FillTab, ExportTab } from './components/tabs'
import { SVGNode } from './types/svg'

function AppContent() {
  const {
    activeTab,
    setActiveTab,
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
    selectedNodeIds,
    setSelectedNodeIds,
    setFillTargetNodeId,
    syncSvgContent,
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
    syncSvgContent()
  }

  const handleToggleCrop = () => {
    disarmActions()
    setShowCrop(!showCrop)
  }

  const handleFill = () => {
    disarmActions()

    // Check if a layer is selected
    if (selectedNodeIds.size !== 1) {
      setStatusMessage('error:Select a single layer or group to use Fill')
      return
    }

    const selectedId = Array.from(selectedNodeIds)[0]

    // Find the selected node
    const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }

    const selectedNode = findNode(layerNodes, selectedId)
    if (!selectedNode) {
      setStatusMessage('error:Could not find selected layer')
      return
    }

    // Check if the layer contains fill paths (closed shapes with fill attribute)
    const hasFillPaths = (node: SVGNode): boolean => {
      const element = node.element
      const fill = element.getAttribute('fill')
      const style = element.getAttribute('style')

      // Check for fill in attributes or style
      if (fill && fill !== 'none' && fill !== 'transparent') {
        return true
      }
      if (style) {
        const fillMatch = style.match(/fill:\s*([^;]+)/)
        if (fillMatch && fillMatch[1] !== 'none' && fillMatch[1] !== 'transparent') {
          return true
        }
      }

      // Check children recursively
      for (const child of node.children) {
        if (hasFillPaths(child)) return true
      }

      return false
    }

    if (!hasFillPaths(selectedNode)) {
      setStatusMessage('error:Fill is only supported for closed shapes with fills')
      return
    }

    // Navigate to Fill tab with the selected node
    setFillTargetNodeId(selectedId)
    setActiveTab('fill')
    setStatusMessage('')
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
                onClick={handleFill}
                className="function-button"
                title={selectedNodeIds.size === 1 ? "Convert fills to line hatching" : "Select a layer first"}
                style={{
                  background: selectedNodeIds.size === 1 ? '#9b59b6' : '#bdc3c7',
                  opacity: selectedNodeIds.size === 1 ? 1 : 0.7,
                }}
              >
                ▤ Fill
              </button>
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
