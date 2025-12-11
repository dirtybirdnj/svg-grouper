// Path diagnostics and analysis

import { SubpathInfo, PathDiagnostics, PathIssue } from './types'
import { parsePathIntoSubpaths, extractPointsFromSubpath, isSubpathClosed } from './subpathParsing'
import { getWindingDirection, calculateArea, getBoundingBox } from './geometryCalc'

/**
 * Full path diagnostics
 */
export function analyzePathD(d: string): PathDiagnostics {
  const subpathStrings = parsePathIntoSubpaths(d)
  const subpaths: SubpathInfo[] = []
  const issues: PathIssue[] = []

  let totalPointCount = 0
  let hasUnclosedPaths = false
  const windings: string[] = []

  subpathStrings.forEach((subpathStr, index) => {
    const points = extractPointsFromSubpath(subpathStr)
    const isClosed = isSubpathClosed(subpathStr)
    const winding = getWindingDirection(points)
    const bbox = getBoundingBox(points)
    const area = calculateArea(points)

    totalPointCount += points.length
    windings.push(winding)

    if (!isClosed) {
      hasUnclosedPaths = true
      issues.push({
        type: 'unclosed',
        message: `Subpath ${index + 1} is not closed (no Z command)`,
        subpathIndex: index,
        severity: 'warning'
      })
    }

    if (area < 0.01 && points.length > 0) {
      issues.push({
        type: 'zero-area',
        message: `Subpath ${index + 1} has near-zero area`,
        subpathIndex: index,
        severity: 'warning'
      })
    }

    if (points.length < 3 && points.length > 0) {
      issues.push({
        type: 'degenerate',
        message: `Subpath ${index + 1} has fewer than 3 points`,
        subpathIndex: index,
        severity: 'error'
      })
    }

    subpaths.push({
      index,
      startIndex: d.indexOf(subpathStr),
      commands: subpathStr,
      points,
      isClosed,
      windingDirection: winding,
      boundingBox: bbox,
      pointCount: points.length,
      area
    })
  })

  const hasCompoundPath = subpaths.length > 1
  const hasMixedWinding = new Set(windings).size > 1

  if (hasCompoundPath) {
    issues.unshift({
      type: 'compound',
      message: `Path contains ${subpaths.length} subpaths`,
      severity: 'info'
    })
  }

  if (hasMixedWinding && subpaths.length > 1) {
    issues.push({
      type: 'mixed-winding',
      message: 'Mixed winding directions (may indicate holes)',
      severity: 'info'
    })
  }

  return {
    subpathCount: subpaths.length,
    subpaths,
    totalPointCount,
    hasCompoundPath,
    hasUnclosedPaths,
    hasMixedWinding,
    issues
  }
}
