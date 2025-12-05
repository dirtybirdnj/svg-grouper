import { contextBridge, ipcRenderer } from 'electron'
import type {
  FillGenerationParams,
  FillGenerationResult,
  HatchLine,
  FileOpenedData,
  ExportFilesArgs,
  CropSVGArgs,
  FlattenShapesArgs,
  NormalizeSVGArgs,
  FillProgressData,
} from './types'

contextBridge.exposeInMainWorld('electron', {
  onMainMessage: (callback: (message: string) => void) => {
    ipcRenderer.on('main-process-message', (_event, message) => callback(message))
  },
  // Normalize SVG coordinates (transform viewBox to start at 0,0)
  normalizeSVG: (args: NormalizeSVGArgs) => {
    return ipcRenderer.invoke('normalize-svg', args)
  },
  cropSVG: (args: CropSVGArgs) => {
    return ipcRenderer.invoke('crop-svg', args)
  },
  flattenShapes: (args: FlattenShapesArgs) => {
    return ipcRenderer.invoke('flatten-shapes', args)
  },
  // Menu command listener
  onMenuCommand: (callback: (command: string) => void) => {
    ipcRenderer.on('menu-command', (_event, command) => callback(command))
  },
  // File opened from menu
  onFileOpened: (callback: (data: FileOpenedData) => void) => {
    ipcRenderer.on('file-opened', (_event, data) => callback(data))
  },
  // Export multiple files to a directory
  exportMultipleFiles: (args: ExportFilesArgs) => {
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
  onFillProgress: (callback: (data: FillProgressData) => void) => {
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
  // rat-king fill generation (Rust-based, much faster)
  generateFillsRatKing: (svgContent: string, pattern: string, spacing: number, angle: number): Promise<{ success: boolean; svg: string }> => {
    return ipcRenderer.invoke('generate-fills-ratking', svgContent, pattern, spacing, angle)
  },
  // Fill pattern using rat-king-cli (alternative API)
  fillPattern: (args: { svg: string; pattern: string; spacing: number; angle: number }): Promise<string> => {
    return ipcRenderer.invoke('fill-pattern', args)
  },
})
