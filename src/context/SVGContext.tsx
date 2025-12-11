// SVG Document Context - Core SVG state and manipulation

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { SVGNode } from '../types/svg'

interface SVGContextType {
  // SVG content state
  svgContent: string | null
  setSvgContent: (content: string | null) => void
  fileName: string | null
  setFileName: (name: string | null) => void
  svgDimensions: { width: number; height: number } | null
  setSvgDimensions: (dims: { width: number; height: number } | null) => void

  // SVG element reference for syncing content
  svgElementRef: React.MutableRefObject<SVGSVGElement | null>
  syncSvgContent: () => void

  // Flag to skip re-parsing when SVG is updated programmatically
  skipNextParse: React.MutableRefObject<boolean>

  // Original SVG attributes to preserve during rebuilds
  originalSvgAttrs: React.MutableRefObject<string[] | null>

  // Rebuild SVG content from layer tree
  rebuildSvgFromLayers: (nodes: SVGNode[], setLayerNodes: (nodes: SVGNode[]) => void) => void

  // Refresh element references after SVG rebuild
  refreshElementRefs: (layerNodes: SVGNode[], setLayerNodes: (nodes: SVGNode[]) => void) => void
}

const SVGContext = createContext<SVGContextType | null>(null)

export function SVGProvider({ children }: { children: ReactNode }) {
  // SVG state
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [svgDimensions, setSvgDimensions] = useState<{ width: number; height: number } | null>(null)

  // SVG element reference for syncing content
  const svgElementRef = useRef<SVGSVGElement | null>(null)

  // Flag to skip re-parsing when SVG is updated programmatically
  const skipNextParse = useRef(false)

  // Store original SVG attributes to preserve during rebuilds
  const originalSvgAttrs = useRef<string[] | null>(null)

  // Ref to track pending refresh timeout
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncSvgContent = useCallback(() => {
    if (svgElementRef.current) {
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svgElementRef.current)
      setSvgContent(svgString)
    }
  }, [])

  // Rebuild SVG content from the layer tree
  const rebuildSvgFromLayers = useCallback((nodes: SVGNode[], setLayerNodes: (nodes: SVGNode[]) => void) => {
    if (!svgElementRef.current || nodes.length === 0) return

    // Use original SVG attributes if available
    let svgAttrs: string[]
    if (originalSvgAttrs.current && originalSvgAttrs.current.length > 0) {
      svgAttrs = originalSvgAttrs.current
    } else {
      const rootSvg = svgElementRef.current
      svgAttrs = []
      for (const attr of Array.from(rootSvg.attributes)) {
        svgAttrs.push(`${attr.name}="${attr.value}"`)
      }
      originalSvgAttrs.current = svgAttrs
    }

    // Build content from layer nodes
    const buildNodeContent = (node: SVGNode): string => {
      if (node.customMarkup) {
        if (node.isHidden) {
          return `<g style="display:none">${node.customMarkup}</g>`
        }
        return node.customMarkup
      }

      if (node.children.length > 0) {
        const childContent = node.children.map(buildNodeContent).join('\n')
        const el = node.element
        const tagName = el.tagName.toLowerCase()

        const nonContainerElements = ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'use']
        const useGroupWrapper = nonContainerElements.includes(tagName)
        const outputTagName = useGroupWrapper ? 'g' : el.tagName

        const attrs: string[] = []
        let existingStyle = ''
        for (const attr of Array.from(el.attributes)) {
          if (attr.name === 'style') {
            existingStyle = attr.value
          } else if (useGroupWrapper) {
            if (attr.name === 'id' || attr.name.startsWith('data-')) {
              attrs.push(`${attr.name}="${attr.value}"`)
            }
          } else {
            attrs.push(`${attr.name}="${attr.value}"`)
          }
        }

        let finalStyle = existingStyle
        if (node.isHidden) {
          if (finalStyle && !finalStyle.includes('display:none')) {
            finalStyle = `display:none;${finalStyle}`
          } else if (!finalStyle) {
            finalStyle = 'display:none'
          }
        } else {
          finalStyle = finalStyle.replace(/display:\s*none;?\s*/g, '').trim()
        }

        const styleAttr = (!useGroupWrapper && finalStyle) ? ` style="${finalStyle}"` : (node.isHidden ? ' style="display:none"' : '')
        return `<${outputTagName} ${attrs.join(' ')}${styleAttr}>\n${childContent}\n</${outputTagName}>`
      }

      const serializer = new XMLSerializer()
      const svgEl = node.element as SVGElement
      const originalOutline = svgEl.style?.outline || ''
      const originalOutlineOffset = svgEl.style?.outlineOffset || ''
      if (svgEl.style) {
        svgEl.style.outline = ''
        svgEl.style.outlineOffset = ''
      }

      let markup = serializer.serializeToString(node.element)

      if (svgEl.style) {
        svgEl.style.outline = originalOutline
        svgEl.style.outlineOffset = originalOutlineOffset
      }

      if (!markup.includes(` id="`)) {
        markup = markup.replace(/^<(\w+)/, `<$1 id="${node.id}"`)
      }

      if (node.isHidden) {
        if (markup.includes('style="')) {
          markup = markup.replace('style="', 'style="display:none;')
        } else {
          markup = markup.replace(/^<(\w+)(\s|>)/, '<$1 style="display:none"$2')
        }
      } else {
        markup = markup.replace(/display:\s*none;?\s*/g, '')
        markup = markup.replace(/\s*style=""\s*/g, ' ')
      }

      return markup
    }

    const content = nodes.map(buildNodeContent).join('\n')
    const newSvgContent = `<svg ${svgAttrs.join(' ')}>\n${content}\n</svg>`

    skipNextParse.current = true
    setSvgContent(newSvgContent)

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }

    refreshTimeoutRef.current = setTimeout(() => {
      refreshTimeoutRef.current = null
      if (svgElementRef.current) {
        const refreshRefs = (nodeList: SVGNode[]): SVGNode[] => {
          return nodeList.map(node => {
            let newElement: Element | null = null
            try {
              newElement = svgElementRef.current?.querySelector(`#${CSS.escape(node.id)}`) || null
              if (!newElement && node.customMarkup) {
                newElement = svgElementRef.current?.querySelector(`#hatch-${CSS.escape(node.id)}`) || null
              }
            } catch {
              // CSS.escape might fail on some IDs
            }

            return {
              ...node,
              element: newElement || node.element,
              children: node.children.length > 0 ? refreshRefs(node.children) : node.children
            }
          })
        }

        const refreshedNodes = refreshRefs(nodes)
        setLayerNodes(refreshedNodes)
      }
    }, 50)
  }, [])

  // Refresh element references in layer nodes after SVG rebuild
  const refreshElementRefs = useCallback((layerNodes: SVGNode[], setLayerNodes: (nodes: SVGNode[]) => void) => {
    if (!svgElementRef.current) return

    const svg = svgElementRef.current

    const updateElementRefs = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.map(node => {
        let newElement = svg.querySelector(`#${CSS.escape(node.id)}`)

        if (!newElement && node.customMarkup) {
          newElement = svg.querySelector(`#hatch-${CSS.escape(node.id)}`)
        }

        const element = newElement || node.element

        return {
          ...node,
          element,
          children: node.children.length > 0 ? updateElementRefs(node.children) : node.children
        }
      })
    }

    const updatedNodes = updateElementRefs(layerNodes)
    setLayerNodes(updatedNodes)
  }, [])

  const value: SVGContextType = {
    svgContent,
    setSvgContent,
    fileName,
    setFileName,
    svgDimensions,
    setSvgDimensions,
    svgElementRef,
    syncSvgContent,
    skipNextParse,
    originalSvgAttrs,
    rebuildSvgFromLayers,
    refreshElementRefs,
  }

  return <SVGContext.Provider value={value}>{children}</SVGContext.Provider>
}

export function useSVGContext() {
  const context = useContext(SVGContext)
  if (!context) {
    throw new Error('useSVGContext must be used within an SVGProvider')
  }
  return context
}
