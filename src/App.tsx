import { useState, useCallback, useRef } from 'react'
import './App.css'
import FileUpload from './components/FileUpload'
import SVGCanvas from './components/SVGCanvas'
import LayerTree from './components/LayerTree'
import LoadingOverlay from './components/LoadingOverlay'
import { SVGNode } from './types/svg'
import { parseSVGProgressively } from './utils/svgParser'

interface LoadingState {
  isLoading: boolean
  progress: number
  status: string
  startTime?: number
  estimatedTimeLeft?: number
}

function App() {
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [layerNodes, setLayerNodes] = useState<SVGNode[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    progress: 0,
    status: '',
  })
  const parsingRef = useRef(false)

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

  const handleFileLoad = useCallback((content: string, name: string) => {
    setSvgContent(content)
    setFileName(name)
    setSelectedNodeId(null)
    parsingRef.current = false // Reset parsing flag
  }, [])

  const handleSVGParsed = useCallback(async (svg: SVGSVGElement) => {
    // Prevent multiple simultaneous parsing attempts
    if (parsingRef.current) {
      return
    }

    parsingRef.current = true
    handleProgress(0, 'Starting to parse SVG...')

    try {
      const nodes = await parseSVGProgressively(svg, handleProgress)
      setLayerNodes(nodes)

      // Clear loading state after a brief delay
      setTimeout(() => {
        setLoadingState({
          isLoading: false,
          progress: 100,
          status: 'Complete',
        })
      }, 300)
    } catch (error) {
      console.error('Failed to parse SVG:', error)
      setLoadingState({
        isLoading: false,
        progress: 0,
        status: 'Error parsing SVG',
      })
    }
  }, [handleProgress])

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
            <FileUpload
              onFileLoad={handleFileLoad}
              onLoadStart={handleLoadStart}
              onProgress={handleProgress}
            />
          ) : (
            <SVGCanvas svgContent={svgContent} onSVGParsed={handleSVGParsed} />
          )}

          {loadingState.isLoading && (
            <LoadingOverlay
              progress={loadingState.progress}
              status={loadingState.status}
              estimatedTimeLeft={loadingState.estimatedTimeLeft}
            />
          )}
        </div>
      </main>
    </div>
  )
}

export default App
