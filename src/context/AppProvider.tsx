// Combined App Provider - Wraps all context providers

import { ReactNode } from 'react'
import { SVGProvider } from './SVGContext'
import { LayerProvider } from './LayerContext'
import { CanvasProvider } from './CanvasContext'
import { ToolProvider } from './ToolContext'
import { UIProvider } from './UIContext'
import { FillProvider } from './FillContext'

interface AppProviderProps {
  children: ReactNode
}

/**
 * Combined provider that wraps all context providers.
 * Order matters for any cross-context dependencies.
 */
export function AppProvider({ children }: AppProviderProps) {
  return (
    <UIProvider>
      <SVGProvider>
        <LayerProvider>
          <CanvasProvider>
            <ToolProvider>
              <FillProvider>
                {children}
              </FillProvider>
            </ToolProvider>
          </CanvasProvider>
        </LayerProvider>
      </SVGProvider>
    </UIProvider>
  )
}
