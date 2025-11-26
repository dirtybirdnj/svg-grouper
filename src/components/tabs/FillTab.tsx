import { useAppContext } from '../../context/AppContext'
import './FillTab.css'

export default function FillTab() {
  const { svgContent } = useAppContext()

  if (!svgContent) {
    return (
      <div className="fill-tab empty-state">
        <div className="empty-content">
          <h3>No SVG Loaded</h3>
          <p>Go to the Sort tab and upload an SVG to use line fill features.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fill-tab">
      <aside className="fill-sidebar">
        <div className="sidebar-header">
          <h2>Line Fill</h2>
        </div>
        <div className="sidebar-content">
          <div className="fill-section">
            <h3>Pattern Settings</h3>

            <div className="fill-control">
              <label>Line Spacing</label>
              <div className="control-row">
                <input
                  type="range"
                  min="1"
                  max="20"
                  defaultValue="5"
                  className="fill-slider"
                />
                <span className="control-value">5px</span>
              </div>
            </div>

            <div className="fill-control">
              <label>Angle</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="180"
                  defaultValue="45"
                  className="fill-slider"
                />
                <span className="control-value">45°</span>
              </div>
            </div>

            <div className="fill-control">
              <label>
                <input type="checkbox" />
                Cross-hatch
              </label>
            </div>

            <div className="fill-control">
              <label>Inset</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="10"
                  defaultValue="0"
                  className="fill-slider"
                />
                <span className="control-value">0px</span>
              </div>
            </div>
          </div>

          <div className="fill-section">
            <h3>Target Layers</h3>
            <p className="section-hint">Select layers with fills to convert to hatching</p>
            <div className="layer-list-placeholder">
              <p>Layer selection coming soon...</p>
            </div>
          </div>

          <div className="fill-actions">
            <button className="fill-preview-btn" disabled>
              Preview
            </button>
            <button className="fill-apply-btn" disabled>
              Apply Fill
            </button>
          </div>
        </div>
      </aside>

      <main className="fill-main">
        <div className="fill-canvas-placeholder">
          <div className="coming-soon">
            <h2>▤ Line Fill Feature</h2>
            <p>Coming in Phase 3</p>
            <ul>
              <li>Convert solid fills to hatched patterns</li>
              <li>Adjustable spacing and angle</li>
              <li>Cross-hatching support</li>
              <li>Real-time preview</li>
              <li>Optimized for pen plotters</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  )
}
