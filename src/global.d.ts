export {}

// Fill generation types (shared between frontend and backend)
interface FillGenerationParams {
  paths: Array<{
    id: string
    color: string
    polygons: Array<{ outer: Array<{ x: number; y: number }>; holes: Array<Array<{ x: number; y: number }>> }>
  }>
  boundingBox: { x: number; y: number; width: number; height: number }
  fillPattern: string
  lineSpacing: number
  angle: number
  crossHatch: boolean
  inset: number
  wiggleAmplitude: number
  wiggleFrequency: number
  spiralOverDiameter: number
  singleSpiral: boolean
  singleHilbert: boolean
  singleFermat: boolean
  customTileShape: string
  customTileGap: number
  customTileScale: number
  customTileRotateOffset: number
  enableCrop: boolean
  cropInset: number
}

interface FillGenerationResult {
  paths: Array<{
    pathId: string
    lines: Array<{ x1: number; y1: number; x2: number; y2: number }>
    polygon: Array<{ x: number; y: number }>
  }>
  success: boolean
  error?: string
}

interface HatchLineIPC {
  x1: number
  y1: number
  x2: number
  y2: number
}

declare global {
  interface Window {
    electron?: {
      onMainMessage: (callback: (message: string) => void) => void
      cropSVG: (args: { svg: string; x: number; y: number; width: number; height: number }) => Promise<string>
      flattenShapes: (args: { svg: string; color: string }) => Promise<string>
      onMenuCommand: (callback: (command: string) => void) => void
      onFileOpened: (callback: (data: { content: string; fileName: string; filePath: string }) => void) => void
      exportMultipleFiles: (args: { files: { name: string; content: string }[]; baseName: string }) => Promise<{ success: boolean; exportDir?: string; savedFiles?: string[]; error?: string }>
      // Fill generation (runs in worker thread for responsiveness)
      generateFills: (params: FillGenerationParams) => Promise<FillGenerationResult>
      optimizeFillLines: (lines: HatchLineIPC[]) => Promise<HatchLineIPC[]>
      onFillProgress: (callback: (data: { progress: number; status: string }) => void) => void
      offFillProgress: () => void
      abortFillGeneration: () => Promise<{ success: boolean }>
    }
  }
}

// Type declaration for simplify-js
declare module 'simplify-js' {
  interface Point {
    x: number
    y: number
  }
  function simplify<T extends Point>(points: T[], tolerance?: number, highQuality?: boolean): T[]
  export default simplify
}
