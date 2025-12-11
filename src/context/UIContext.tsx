// UI Context - Loading, status, and UI state

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { TabKey, LoadingState } from './types'

interface UIContextType {
  // Tab state
  activeTab: TabKey
  setActiveTab: (tab: TabKey) => void

  // Loading state
  loadingState: LoadingState
  setLoadingState: (state: LoadingState) => void
  handleLoadStart: () => void
  handleProgress: (progress: number, status: string) => void

  // Parsing ref
  parsingRef: React.MutableRefObject<boolean>

  // Status message
  statusMessage: string
  setStatusMessage: (message: string) => void

  // Processing state (for spinning gear indicator)
  isProcessing: boolean
  setIsProcessing: (processing: boolean) => void

  // Armed states for confirmation buttons
  flattenArmed: boolean
  setFlattenArmed: (armed: boolean) => void

  // Import settings
  flattenOnImport: boolean
  setFlattenOnImport: (flatten: boolean) => void

  // Pending flatten flag
  pendingFlatten: boolean
  setPendingFlatten: (pending: boolean) => void
}

const UIContext = createContext<UIContextType | null>(null)

export function UIProvider({ children }: { children: ReactNode }) {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('sort')

  // Loading state
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    progress: 0,
    status: '',
  })

  // Parsing ref
  const parsingRef = useRef(false)

  // Status message
  const [statusMessage, setStatusMessage] = useState('')

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false)

  // Armed states
  const [flattenArmed, setFlattenArmed] = useState(false)

  // Import settings - persist to localStorage
  const [flattenOnImport, setFlattenOnImportState] = useState(() => {
    try {
      const stored = localStorage.getItem('svg-grouper-flatten-on-import')
      return stored === 'true'
    } catch {
      return false
    }
  })

  const setFlattenOnImport = useCallback((flatten: boolean) => {
    setFlattenOnImportState(flatten)
    try {
      localStorage.setItem('svg-grouper-flatten-on-import', String(flatten))
    } catch {
      // localStorage not available
    }
  }, [])

  // Pending flatten flag
  const [pendingFlatten, setPendingFlatten] = useState(false)

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

  const value: UIContextType = {
    activeTab,
    setActiveTab,
    loadingState,
    setLoadingState,
    handleLoadStart,
    handleProgress,
    parsingRef,
    statusMessage,
    setStatusMessage,
    isProcessing,
    setIsProcessing,
    flattenArmed,
    setFlattenArmed,
    flattenOnImport,
    setFlattenOnImport,
    pendingFlatten,
    setPendingFlatten,
  }

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUIContext() {
  const context = useContext(UIContext)
  if (!context) {
    throw new Error('useUIContext must be used within a UIProvider')
  }
  return context
}
