// Fill Context - Fill operation state

import { createContext, useContext, useState, ReactNode } from 'react'
import { OrderData } from './types'

interface FillContextType {
  // Fill mode state - supports single ID or array of IDs for multiple selection
  fillTargetNodeIds: string[]
  setFillTargetNodeIds: (ids: string[]) => void

  // Weave mode state - set to true when menu command is triggered
  weaveRequested: boolean
  setWeaveRequested: (requested: boolean) => void

  // Order mode state
  orderData: OrderData | null
  setOrderData: (data: OrderData | null) => void
}

const FillContext = createContext<FillContextType | null>(null)

export function FillProvider({ children }: { children: ReactNode }) {
  // Fill mode state
  const [fillTargetNodeIds, setFillTargetNodeIds] = useState<string[]>([])

  // Weave mode state
  const [weaveRequested, setWeaveRequested] = useState(false)

  // Order mode state
  const [orderData, setOrderData] = useState<OrderData | null>(null)

  const value: FillContextType = {
    fillTargetNodeIds,
    setFillTargetNodeIds,
    weaveRequested,
    setWeaveRequested,
    orderData,
    setOrderData,
  }

  return <FillContext.Provider value={value}>{children}</FillContext.Provider>
}

export function useFillContext() {
  const context = useContext(FillContext)
  if (!context) {
    throw new Error('useFillContext must be used within a FillProvider')
  }
  return context
}
