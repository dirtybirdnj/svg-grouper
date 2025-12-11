// Hook for handling Electron menu commands

import { useEffect, MutableRefObject } from 'react'
import { TabKey } from '../types/tabs'

type ActiveTool = 'none' | 'merge-colors' | 'reduce-palette' | 'fill-pattern'

interface ArrangeHandlers {
  moveUp: () => void
  moveDown: () => void
  bringToFront: () => void
  sendToBack: () => void
  group: () => void
  ungroup: () => void
}

interface ToolHandlers {
  convertToFills: () => void
  normalizeColors: () => void
  separateCompoundPaths: () => void
}

interface UseMenuCommandsParams {
  activeTab: TabKey
  setActiveTab: (tab: TabKey) => void
  setSvgContent: (content: string) => void
  setFileName: (name: string) => void
  setWeaveRequested: (requested: boolean) => void
  setActiveTool: (tool: ActiveTool) => void
  handleFlattenAll: () => void
  handleFill: () => void
  handleOrder: () => void
  handleToggleCrop: () => void
  handleSelectAllLayers: () => void
  handleZoomIn: () => void
  handleZoomOut: () => void
  handleFitToScreen: () => void
  arrangeHandlers: MutableRefObject<ArrangeHandlers | null>
  toolHandlers: MutableRefObject<ToolHandlers | null>
}

export function useMenuCommands({
  activeTab,
  setActiveTab,
  setSvgContent,
  setFileName,
  setWeaveRequested,
  setActiveTool,
  handleFlattenAll,
  handleFill,
  handleOrder,
  handleToggleCrop,
  handleSelectAllLayers,
  handleZoomIn,
  handleZoomOut,
  handleFitToScreen,
  arrangeHandlers,
  toolHandlers,
}: UseMenuCommandsParams) {
  useEffect(() => {
    if (!window.electron) return

    // Handle menu commands
    window.electron.onMenuCommand((command: string) => {
      switch (command) {
        case 'flatten':
          handleFlattenAll()
          break
        case 'fill':
          handleFill()
          break
        case 'weave':
          // Navigate to fill tab if not already there, and trigger weave
          if (activeTab !== 'fill') {
            setActiveTab('fill')
          }
          setWeaveRequested(true)
          break
        case 'order':
          handleOrder()
          break
        case 'crop':
          handleToggleCrop()
          break
        case 'export':
          setActiveTab('export')
          break
        case 'tab-sort':
          setActiveTab('sort')
          break
        case 'tab-fill':
          setActiveTab('fill')
          break
        case 'tab-order':
          setActiveTab('order')
          break
        case 'tab-export':
          setActiveTab('export')
          break
        case 'zoom-in':
          handleZoomIn()
          break
        case 'zoom-out':
          handleZoomOut()
          break
        case 'zoom-fit':
          handleFitToScreen()
          break
        case 'arrange-move-up':
          arrangeHandlers.current?.moveUp()
          break
        case 'arrange-move-down':
          arrangeHandlers.current?.moveDown()
          break
        case 'arrange-bring-front':
          arrangeHandlers.current?.bringToFront()
          break
        case 'arrange-send-back':
          arrangeHandlers.current?.sendToBack()
          break
        case 'arrange-group':
          arrangeHandlers.current?.group()
          break
        case 'arrange-ungroup':
          arrangeHandlers.current?.ungroup()
          break
        case 'select-all-layers':
          handleSelectAllLayers()
          break
        case 'convert-to-fills':
          toolHandlers.current?.convertToFills()
          break
        case 'normalize-colors':
          toolHandlers.current?.normalizeColors()
          break
        case 'separate-compound-paths':
          toolHandlers.current?.separateCompoundPaths()
          break
        case 'merge-colors':
          setActiveTool('merge-colors')
          break
        case 'reduce-palette':
          setActiveTool('reduce-palette')
          break
        case 'fill-pattern':
          setActiveTool('fill-pattern')
          break
      }
    })

    // Handle file opened from menu
    window.electron.onFileOpened((data) => {
      setSvgContent(data.content)
      setFileName(data.fileName)
      setActiveTab('sort')
    })
  }, []) // Empty deps - these are one-time listeners
}
