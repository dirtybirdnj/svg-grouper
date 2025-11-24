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
})
