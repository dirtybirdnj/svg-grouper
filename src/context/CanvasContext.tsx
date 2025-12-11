// Canvas Context - Viewport and crop controls

import { createContext, useContext, useState, ReactNode } from 'react'
import { CropAspectRatio } from './types'

interface CanvasContextType {
  // Canvas state
  scale: number
  setScale: (scale: number) => void
  offset: { x: number; y: number }
  setOffset: (offset: { x: number; y: number }) => void

  // Crop state
  showCrop: boolean
  setShowCrop: (show: boolean) => void
  cropAspectRatio: CropAspectRatio
  setCropAspectRatio: (ratio: CropAspectRatio) => void
  cropSize: number
  setCropSize: (size: number) => void
}

const CanvasContext = createContext<CanvasContextType | null>(null)

export function CanvasProvider({ children }: { children: ReactNode }) {
  // Canvas state
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  // Crop state
  const [showCrop, setShowCrop] = useState(false)
  const [cropAspectRatio, setCropAspectRatio] = useState<CropAspectRatio>('3:4')
  const [cropSize, setCropSize] = useState(0.25)

  const value: CanvasContextType = {
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
  }

  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>
}

export function useCanvasContext() {
  const context = useContext(CanvasContext)
  if (!context) {
    throw new Error('useCanvasContext must be used within a CanvasProvider')
  }
  return context
}
