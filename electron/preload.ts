import { contextBridge, ipcRenderer } from 'electron'

// Type definitions for fill generation (matches electron/fillGenerator.ts)
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

interface HatchLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

contextBridge.exposeInMainWorld('electron', {
  onMainMessage: (callback: (message: string) => void) => {
    ipcRenderer.on('main-process-message', (_event, message) => callback(message))
  },
  cropSVG: (args: { svg: string; x: number; y: number; width: number; height: number }) => {
    return ipcRenderer.invoke('crop-svg', args)
  },
  flattenShapes: (args: { svg: string; color: string }) => {
    return ipcRenderer.invoke('flatten-shapes', args)
  },
  // Menu command listener
  onMenuCommand: (callback: (command: string) => void) => {
    ipcRenderer.on('menu-command', (_event, command) => callback(command))
  },
  // File opened from menu
  onFileOpened: (callback: (data: { content: string; fileName: string; filePath: string }) => void) => {
    ipcRenderer.on('file-opened', (_event, data) => callback(data))
  },
  // Export multiple files to a directory
  exportMultipleFiles: (args: { files: { name: string; content: string }[]; baseName: string }) => {
    return ipcRenderer.invoke('export-multiple-files', args)
  },
  // Fill generation (runs in main process for better performance)
  generateFills: (params: FillGenerationParams): Promise<FillGenerationResult> => {
    return ipcRenderer.invoke('generate-fills', params)
  },
  // Optimize fill line order (runs in main process)
  optimizeFillLines: (lines: HatchLine[]): Promise<HatchLine[]> => {
    return ipcRenderer.invoke('optimize-fill-lines', lines)
  },
  // Fill generation progress listener
  onFillProgress: (callback: (data: { progress: number; status: string }) => void) => {
    ipcRenderer.on('fill-progress', (_event, data) => callback(data))
  },
  // Remove fill progress listener
  offFillProgress: () => {
    ipcRenderer.removeAllListeners('fill-progress')
  },
  // Abort in-progress fill generation
  abortFillGeneration: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('abort-fill-generation')
  },
})
