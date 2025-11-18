import { useState } from 'react'
import './App.css'
import FileUpload from './components/FileUpload'
import SVGCanvas from './components/SVGCanvas'
import LayerTree from './components/LayerTree'
import { SVGNode } from './types/svg'
import { parseSVG } from './utils/svgParser'

function App() {
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [layerNodes, setLayerNodes] = useState<SVGNode[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const handleFileLoad = (content: string, name: string) => {
    setSvgContent(content)
    setFileName(name)
    setSelectedNodeId(null)
  }

  const handleSVGParsed = (svg: SVGSVGElement) => {
    const nodes = parseSVG(svg)
    setLayerNodes(nodes)
  }

  const handleNodeSelect = (node: SVGNode) => {
    setSelectedNodeId(node.id)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Layers</h2>
        </div>
        <div className="sidebar-content">
          {!svgContent ? (
            <p style={{ padding: '1rem', color: '#999', fontSize: '0.9rem' }}>
              Upload an SVG to see layers
            </p>
          ) : (
            <LayerTree
              nodes={layerNodes}
              selectedNodeId={selectedNodeId}
              onNodeSelect={handleNodeSelect}
            />
          )}
        </div>
      </aside>

      <main className="main-panel">
        <div className="main-header">
          <h1>SVG Grouper</h1>
          {fileName && <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: '#666' }}>{fileName}</p>}
        </div>
        <div className="canvas-container">
          {!svgContent ? (
            <FileUpload onFileLoad={handleFileLoad} />
          ) : (
            <SVGCanvas svgContent={svgContent} onSVGParsed={handleSVGParsed} />
          )}
        </div>
      </main>
    </div>
  )
}

export default App
