export interface SVGNode {
  id: string
  type: string
  name: string
  element: Element
  children: SVGNode[]
  isGroup: boolean
}
