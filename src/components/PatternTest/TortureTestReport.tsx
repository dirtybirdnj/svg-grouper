import { forwardRef } from 'react'
import { TortureTestResult } from './types'
import { ALL_PATTERNS, PERF_THRESHOLDS } from './constants'

interface TortureTestReportProps {
  results: TortureTestResult[]
}

export const TortureTestReport = forwardRef<HTMLDivElement, TortureTestReportProps>(
  ({ results }, ref) => {
    if (results.length === 0) return null

    return (
      <div className="torture-test-report" ref={ref}>
        <h3>Torture Test Report</h3>
        <div className="torture-summary">
          <span className="summary-item">
            Patterns tested: {results.length}/{ALL_PATTERNS.length}
          </span>
          <span className="summary-item excellent">
            Excellent: {results.filter(r => r.status === 'excellent').length}
          </span>
          <span className="summary-item acceptable">
            Acceptable: {results.filter(r => r.status === 'acceptable').length}
          </span>
          <span className="summary-item slow">
            Slow: {results.filter(r => r.status === 'slow').length}
          </span>
          <span className="summary-item failed">
            Failed: {results.filter(r => r.status === 'failed').length}
          </span>
        </div>
        <table className="torture-table">
          <thead>
            <tr>
              <th>Pattern</th>
              <th>Time</th>
              <th>Lines</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.pattern} className={`status-${result.status}`}>
                <td className="pattern-name">{result.pattern}</td>
                <td className="time">{result.timeMs.toFixed(1)}ms</td>
                <td className="lines">{result.lines.toLocaleString()}</td>
                <td className={`status ${result.status}`}>
                  {result.status === 'excellent' && '✓ Excellent'}
                  {result.status === 'acceptable' && '○ Acceptable'}
                  {result.status === 'slow' && '⚠ Slow'}
                  {result.status === 'failed' && '✗ Failed'}
                </td>
                <td className="notes">
                  {result.error && <span className="error">{result.error}</span>}
                  {result.lines === 0 && !result.error && <span className="warning">No lines generated</span>}
                  {result.timeMs > PERF_THRESHOLDS.slow && <span className="warning">Exceeds {PERF_THRESHOLDS.slow}ms threshold</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="threshold-legend">
          <span>Thresholds:</span>
          <span className="excellent">Excellent: &lt;{PERF_THRESHOLDS.excellent}ms</span>
          <span className="acceptable">Acceptable: &lt;{PERF_THRESHOLDS.acceptable}ms</span>
          <span className="slow">Slow: &lt;{PERF_THRESHOLDS.slow}ms</span>
          <span className="failed">Failed: &gt;{PERF_THRESHOLDS.slow}ms or error</span>
        </div>
      </div>
    )
  }
)

TortureTestReport.displayName = 'TortureTestReport'
