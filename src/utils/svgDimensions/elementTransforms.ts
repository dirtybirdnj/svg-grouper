// Element coordinate transformation utilities

/**
 * Transform a path's d attribute by applying an offset
 */
export function transformPathD(d: string, offsetX: number, offsetY: number): string {
  // Match commands and their parameters
  // This regex captures the command letter and all following numbers
  const result: string[] = []
  const commands = d.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || []

  for (const cmd of commands) {
    const type = cmd[0]
    const isRelative = type === type.toLowerCase()
    const upperType = type.toUpperCase()

    // For relative commands, don't transform (they're relative to current point)
    if (isRelative && upperType !== 'M') {
      result.push(cmd)
      continue
    }

    const values = cmd.slice(1).trim()
    if (!values) {
      result.push(cmd)
      continue
    }

    // Parse numbers (handles negative numbers and decimals)
    const nums = values.match(/-?[\d.]+(?:e[+-]?\d+)?/gi)?.map(parseFloat) || []

    let transformed: number[] = []

    switch (upperType) {
      case 'M': // moveto: x,y pairs
      case 'L': // lineto: x,y pairs
      case 'T': // smooth quadratic: x,y pairs
        for (let i = 0; i < nums.length; i += 2) {
          transformed.push(nums[i] + offsetX, nums[i + 1] + offsetY)
        }
        break

      case 'H': // horizontal line: x values only
        for (const n of nums) {
          transformed.push(n + offsetX)
        }
        break

      case 'V': // vertical line: y values only
        for (const n of nums) {
          transformed.push(n + offsetY)
        }
        break

      case 'C': // cubic bezier: x1,y1,x2,y2,x,y
        for (let i = 0; i < nums.length; i += 6) {
          transformed.push(
            nums[i] + offsetX, nums[i + 1] + offsetY,
            nums[i + 2] + offsetX, nums[i + 3] + offsetY,
            nums[i + 4] + offsetX, nums[i + 5] + offsetY
          )
        }
        break

      case 'S': // smooth cubic: x2,y2,x,y
      case 'Q': // quadratic: x1,y1,x,y
        for (let i = 0; i < nums.length; i += 4) {
          transformed.push(
            nums[i] + offsetX, nums[i + 1] + offsetY,
            nums[i + 2] + offsetX, nums[i + 3] + offsetY
          )
        }
        break

      case 'A': // arc: rx,ry,rotation,large-arc,sweep,x,y
        for (let i = 0; i < nums.length; i += 7) {
          transformed.push(
            nums[i], nums[i + 1], nums[i + 2], nums[i + 3], nums[i + 4],
            nums[i + 5] + offsetX, nums[i + 6] + offsetY
          )
        }
        break

      case 'Z': // closepath: no parameters
        result.push(type)
        continue

      default:
        result.push(cmd)
        continue
    }

    result.push(type + transformed.map(n => n.toFixed(6)).join(' '))
  }

  return result.join(' ')
}

/**
 * Transform points attribute (for polygon/polyline) by applying an offset
 */
export function transformPoints(points: string, offsetX: number, offsetY: number): string {
  const nums = points.trim().split(/[\s,]+/).map(parseFloat)
  const transformed: number[] = []

  for (let i = 0; i < nums.length; i += 2) {
    if (!isNaN(nums[i]) && !isNaN(nums[i + 1])) {
      transformed.push(nums[i] + offsetX, nums[i + 1] + offsetY)
    }
  }

  return transformed.map(n => n.toFixed(6)).join(' ')
}

/**
 * Transform rect element coordinates
 */
export function transformRect(rect: Element, offsetX: number, offsetY: number): void {
  const x = parseFloat(rect.getAttribute('x') || '0')
  const y = parseFloat(rect.getAttribute('y') || '0')
  rect.setAttribute('x', String(x + offsetX))
  rect.setAttribute('y', String(y + offsetY))
}

/**
 * Transform circle element coordinates
 */
export function transformCircle(circle: Element, offsetX: number, offsetY: number): void {
  const cx = parseFloat(circle.getAttribute('cx') || '0')
  const cy = parseFloat(circle.getAttribute('cy') || '0')
  circle.setAttribute('cx', String(cx + offsetX))
  circle.setAttribute('cy', String(cy + offsetY))
}

/**
 * Transform ellipse element coordinates
 */
export function transformEllipse(ellipse: Element, offsetX: number, offsetY: number): void {
  const cx = parseFloat(ellipse.getAttribute('cx') || '0')
  const cy = parseFloat(ellipse.getAttribute('cy') || '0')
  ellipse.setAttribute('cx', String(cx + offsetX))
  ellipse.setAttribute('cy', String(cy + offsetY))
}

/**
 * Transform line element coordinates
 */
export function transformLine(line: Element, offsetX: number, offsetY: number): void {
  const x1 = parseFloat(line.getAttribute('x1') || '0')
  const y1 = parseFloat(line.getAttribute('y1') || '0')
  const x2 = parseFloat(line.getAttribute('x2') || '0')
  const y2 = parseFloat(line.getAttribute('y2') || '0')
  line.setAttribute('x1', String(x1 + offsetX))
  line.setAttribute('y1', String(y1 + offsetY))
  line.setAttribute('x2', String(x2 + offsetX))
  line.setAttribute('y2', String(y2 + offsetY))
}

/**
 * Apply offset transformation to all transformable elements in an SVG
 */
export function transformAllElements(svg: SVGSVGElement, offsetX: number, offsetY: number): void {
  // Transform all path elements
  const paths = svg.querySelectorAll('path')
  for (const path of paths) {
    const d = path.getAttribute('d')
    if (d) {
      path.setAttribute('d', transformPathD(d, offsetX, offsetY))
    }
  }

  // Transform polygon/polyline elements
  const polys = svg.querySelectorAll('polygon, polyline')
  for (const poly of polys) {
    const points = poly.getAttribute('points')
    if (points) {
      poly.setAttribute('points', transformPoints(points, offsetX, offsetY))
    }
  }

  // Transform rect elements
  const rects = svg.querySelectorAll('rect')
  for (const rect of rects) {
    transformRect(rect, offsetX, offsetY)
  }

  // Transform circle elements
  const circles = svg.querySelectorAll('circle')
  for (const circle of circles) {
    transformCircle(circle, offsetX, offsetY)
  }

  // Transform ellipse elements
  const ellipses = svg.querySelectorAll('ellipse')
  for (const ellipse of ellipses) {
    transformEllipse(ellipse, offsetX, offsetY)
  }

  // Transform line elements
  const lines = svg.querySelectorAll('line')
  for (const line of lines) {
    transformLine(line, offsetX, offsetY)
  }
}
