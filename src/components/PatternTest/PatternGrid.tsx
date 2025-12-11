import { FillPatternType } from '../../utils/fillPatterns'
import { HatchLine } from '../../utils/geometry'
import { PatternResult } from './types'
import { SQUARE_SIZE } from './constants'

interface PatternGridProps {
  results: PatternResult[]
  stressTestPattern: FillPatternType
  onPatternSelect: (pattern: FillPatternType) => void
}

// Convert lines to SVG path
function linesToPath(lines: HatchLine[]): string {
  if (lines.length === 0) return ''
  return lines.map(l => `M${l.x1},${l.y1}L${l.x2},${l.y2}`).join(' ')
}

export function PatternGrid({ results, stressTestPattern, onPatternSelect }: PatternGridProps) {
  return (
    <div className="pattern-grid-section">
      <div className="pattern-grid">
        {results.map((result) => (
          <div
            key={result.pattern}
            className={`pattern-cell ${result.error ? 'error' : ''} ${result.lines.length === 0 && !result.error ? 'empty' : ''} ${stressTestPattern === result.pattern ? 'selected' : ''}`}
            onClick={() => onPatternSelect(result.pattern)}
          >
            <div className="pattern-name">{result.pattern}</div>
            <svg
              viewBox={`0 0 ${SQUARE_SIZE + 20} ${SQUARE_SIZE + 20}`}
              className="pattern-preview"
            >
              <rect
                x={10}
                y={10}
                width={SQUARE_SIZE}
                height={SQUARE_SIZE}
                fill="none"
                stroke="#ccc"
                strokeWidth={1}
              />
              <path
                d={linesToPath(result.lines)}
                fill="none"
                stroke={result.error ? '#e74c3c' : (result.lines.length === 0 ? '#f39c12' : '#3498db')}
                strokeWidth={0.5}
              />
            </svg>
            <div className="pattern-stats">
              {result.error ? (
                <span className="error-text" title={result.error}>ERROR</span>
              ) : (
                <>
                  <span className={result.lines.length === 0 ? 'warning-text' : ''}>
                    {result.lines.length} lines
                  </span>
                  <span>{result.timeMs.toFixed(1)}ms</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
