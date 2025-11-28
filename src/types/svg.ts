export interface SVGNode {
  id: string
  type: string
  name: string
  element: Element
  children: SVGNode[]
  isGroup: boolean
  isHidden?: boolean
  // Custom SVG markup to render instead of the original element (used for line fill)
  customMarkup?: string
  // Color of fill lines when customMarkup is used (for color swatch display)
  fillColor?: string
}
