import { contextBridge, ipcRenderer } from 'electron'

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
})
