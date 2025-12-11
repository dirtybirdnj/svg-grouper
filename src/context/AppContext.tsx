/**
 * AppContext - Legacy compatibility layer
 *
 * This file now re-exports from the split context modules.
 * New code should import from './context' or use specific context hooks.
 *
 * Context has been split into:
 * - SVGContext: SVG document state and manipulation
 * - LayerContext: Layer tree and selection
 * - CanvasContext: Viewport and crop controls
 * - ToolContext: Active tool and settings
 * - UIContext: Loading, status, and UI state
 * - FillContext: Fill operation state
 */

// Re-export everything from the new index
export {
  // Types
  type LoadingState,
  type OrderLine,
  type OrderData,
  type ArrangeHandlers,
  type ToolHandlers,
  type OptimizationSettings,
  type ActiveToolType,
  type CropAspectRatio,

  // Individual context providers and hooks
  SVGProvider,
  useSVGContext,
  LayerProvider,
  useLayerContext,
  CanvasProvider,
  useCanvasContext,
  ToolProvider,
  useToolContext,
  UIProvider,
  useUIContext,
  FillProvider,
  useFillContext,

  // Combined provider
  AppProvider,

  // Legacy compatibility hook
  useAppContext,
} from './index'
