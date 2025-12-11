// Weld utilities - path to lines conversion for combining paths

import { HatchLine } from '../../../utils/geometry'
import { SVGNode } from '../../../types/svg'

/**
 * Extract path d attribute as HatchLines
 */
export function pathToLines(pathD: string): HatchLine[] {
  const lines: HatchLine[] = []
  const commands = pathD.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/gi) || []

  let currentX = 0, currentY = 0
  let startX = 0, startY = 0

  for (const cmd of commands) {
    const type = cmd[0]
    const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n))

    switch (type) {
      case 'M':
        currentX = args[0]
        currentY = args[1]
        startX = currentX
        startY = currentY
        for (let i = 2; i < args.length; i += 2) {
          const nextX = args[i]
          const nextY = args[i + 1]
          lines.push({ x1: currentX, y1: currentY, x2: nextX, y2: nextY })
          currentX = nextX
          currentY = nextY
        }
        break
      case 'm':
        currentX += args[0]
        currentY += args[1]
        startX = currentX
        startY = currentY
        for (let i = 2; i < args.length; i += 2) {
          const nextX = currentX + args[i]
          const nextY = currentY + args[i + 1]
          lines.push({ x1: currentX, y1: currentY, x2: nextX, y2: nextY })
          currentX = nextX
          currentY = nextY
        }
        break
      case 'L':
        for (let i = 0; i < args.length; i += 2) {
          const nextX = args[i]
          const nextY = args[i + 1]
          lines.push({ x1: currentX, y1: currentY, x2: nextX, y2: nextY })
          currentX = nextX
          currentY = nextY
        }
        break
      case 'l':
        for (let i = 0; i < args.length; i += 2) {
          const nextX = currentX + args[i]
          const nextY = currentY + args[i + 1]
          lines.push({ x1: currentX, y1: currentY, x2: nextX, y2: nextY })
          currentX = nextX
          currentY = nextY
        }
        break
      case 'H':
        for (const x of args) {
          lines.push({ x1: currentX, y1: currentY, x2: x, y2: currentY })
          currentX = x
        }
        break
      case 'h':
        for (const dx of args) {
          const nextX = currentX + dx
          lines.push({ x1: currentX, y1: currentY, x2: nextX, y2: currentY })
          currentX = nextX
        }
        break
      case 'V':
        for (const y of args) {
          lines.push({ x1: currentX, y1: currentY, x2: currentX, y2: y })
          currentY = y
        }
        break
      case 'v':
        for (const dy of args) {
          const nextY = currentY + dy
          lines.push({ x1: currentX, y1: currentY, x2: currentX, y2: nextY })
          currentY = nextY
        }
        break
      case 'Z':
      case 'z':
        if (currentX !== startX || currentY !== startY) {
          lines.push({ x1: currentX, y1: currentY, x2: startX, y2: startY })
        }
        currentX = startX
        currentY = startY
        break
      case 'C':
        for (let i = 0; i < args.length; i += 6) {
          const endX = args[i + 4]
          const endY = args[i + 5]
          lines.push({ x1: currentX, y1: currentY, x2: endX, y2: endY })
          currentX = endX
          currentY = endY
        }
        break
      case 'c':
        for (let i = 0; i < args.length; i += 6) {
          const endX = currentX + args[i + 4]
          const endY = currentY + args[i + 5]
          lines.push({ x1: currentX, y1: currentY, x2: endX, y2: endY })
          currentX = endX
          currentY = endY
        }
        break
      case 'S':
      case 's':
        for (let i = 0; i < args.length; i += 4) {
          const endX = type === 'S' ? args[i + 2] : currentX + args[i + 2]
          const endY = type === 'S' ? args[i + 3] : currentY + args[i + 3]
          lines.push({ x1: currentX, y1: currentY, x2: endX, y2: endY })
          currentX = endX
          currentY = endY
        }
        break
      case 'Q':
      case 'q':
        for (let i = 0; i < args.length; i += 4) {
          const endX = type === 'Q' ? args[i + 2] : currentX + args[i + 2]
          const endY = type === 'Q' ? args[i + 3] : currentY + args[i + 3]
          lines.push({ x1: currentX, y1: currentY, x2: endX, y2: endY })
          currentX = endX
          currentY = endY
        }
        break
      case 'T':
      case 't':
        for (let i = 0; i < args.length; i += 2) {
          const endX = type === 'T' ? args[i] : currentX + args[i]
          const endY = type === 'T' ? args[i + 1] : currentY + args[i + 1]
          lines.push({ x1: currentX, y1: currentY, x2: endX, y2: endY })
          currentX = endX
          currentY = endY
        }
        break
      case 'A':
      case 'a':
        for (let i = 0; i < args.length; i += 7) {
          const endX = type === 'A' ? args[i + 5] : currentX + args[i + 5]
          const endY = type === 'A' ? args[i + 6] : currentY + args[i + 6]
          lines.push({ x1: currentX, y1: currentY, x2: endX, y2: endY })
          currentX = endX
          currentY = endY
        }
        break
    }
  }

  return lines
}

/**
 * Convert line element to HatchLine
 */
export function lineElementToLine(el: Element): HatchLine | null {
  const x1 = parseFloat(el.getAttribute('x1') || '0')
  const y1 = parseFloat(el.getAttribute('y1') || '0')
  const x2 = parseFloat(el.getAttribute('x2') || '0')
  const y2 = parseFloat(el.getAttribute('y2') || '0')
  if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return null
  return { x1, y1, x2, y2 }
}

/**
 * Collect all lines from a node recursively
 */
export function collectLines(node: SVGNode): HatchLine[] {
  const lines: HatchLine[] = []
  const tagName = node.element.tagName.toLowerCase()

  if (tagName === 'path') {
    const d = node.element.getAttribute('d')
    if (d) {
      lines.push(...pathToLines(d))
    }
  } else if (tagName === 'line') {
    const line = lineElementToLine(node.element)
    if (line) lines.push(line)
  } else if (tagName === 'polyline' || tagName === 'polygon') {
    const points = node.element.getAttribute('points') || ''
    const pairs = points.trim().split(/[\s,]+/).map(parseFloat)
    for (let i = 0; i < pairs.length - 3; i += 2) {
      lines.push({ x1: pairs[i], y1: pairs[i + 1], x2: pairs[i + 2], y2: pairs[i + 3] })
    }
    // Close polygon
    if (tagName === 'polygon' && pairs.length >= 4) {
      lines.push({
        x1: pairs[pairs.length - 2],
        y1: pairs[pairs.length - 1],
        x2: pairs[0],
        y2: pairs[1]
      })
    }
  }

  // Collect from children
  for (const child of node.children) {
    lines.push(...collectLines(child))
  }

  return lines
}
