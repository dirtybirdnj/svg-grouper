// StatusBar component - displays file info, dimensions, path info, and color stats

import { PathInfo, GroupInfo, ColorStats } from './pathAnalysis'

interface StatusBarProps {
  fileName: string | null
  statusMessage: string
  svgDimensions: { width: number; height: number } | null
  selectedPathInfo: PathInfo | null
  selectedGroupInfo: GroupInfo | null
  documentColors: string[]
  documentColorStats: Map<string, ColorStats>
  isHighlightPersistent: boolean
  showPointMarkers: 'none' | 'start' | 'end' | 'all'
  onPathInfoMouseEnter: () => void
  onPathInfoMouseLeave: () => void
  onPathInfoClick: () => void
  onStartPointClick: (e: React.MouseEvent) => void
  onEndPointClick: (e: React.MouseEvent) => void
  onPointCountClick: (e: React.MouseEvent) => void
}

export default function StatusBar({
  fileName,
  statusMessage,
  svgDimensions,
  selectedPathInfo,
  selectedGroupInfo,
  documentColors,
  documentColorStats,
  isHighlightPersistent,
  showPointMarkers,
  onPathInfoMouseEnter,
  onPathInfoMouseLeave,
  onPathInfoClick,
  onStartPointClick,
  onEndPointClick,
  onPointCountClick,
}: StatusBarProps) {
  if (!statusMessage && !fileName) return null

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {fileName && <span className="status-filename">{fileName}</span>}
        {statusMessage && (
          <span className={`status-message ${statusMessage.startsWith('error:') ? 'error' : ''}`}>
            {statusMessage.startsWith('error:') ? statusMessage.slice(6) : statusMessage}
          </span>
        )}
      </div>
      <div className="status-bar-center">
        {svgDimensions && (
          <span className="status-dimensions">
            {svgDimensions.width} × {svgDimensions.height} px • {(svgDimensions.width / 96).toFixed(2)} × {(svgDimensions.height / 96).toFixed(2)} in • {(svgDimensions.width / 37.8).toFixed(2)} × {(svgDimensions.height / 37.8).toFixed(2)} cm
          </span>
        )}
      </div>
      <div className="status-bar-right">
        {selectedPathInfo && (
          <PathInfoDisplay
            pathInfo={selectedPathInfo}
            isHighlightPersistent={isHighlightPersistent}
            showPointMarkers={showPointMarkers}
            onMouseEnter={onPathInfoMouseEnter}
            onMouseLeave={onPathInfoMouseLeave}
            onClick={onPathInfoClick}
            onStartPointClick={onStartPointClick}
            onEndPointClick={onEndPointClick}
            onPointCountClick={onPointCountClick}
          />
        )}
        {selectedGroupInfo && (
          <GroupInfoDisplay groupInfo={selectedGroupInfo} />
        )}
        {!selectedPathInfo && !selectedGroupInfo && documentColors.length > 0 && (
          <ColorStatsDisplay
            colors={documentColors}
            stats={documentColorStats}
          />
        )}
      </div>
    </div>
  )
}

interface PathInfoDisplayProps {
  pathInfo: PathInfo
  isHighlightPersistent: boolean
  showPointMarkers: 'none' | 'start' | 'end' | 'all'
  onMouseEnter: () => void
  onMouseLeave: () => void
  onClick: () => void
  onStartPointClick: (e: React.MouseEvent) => void
  onEndPointClick: (e: React.MouseEvent) => void
  onPointCountClick: (e: React.MouseEvent) => void
}

function PathInfoDisplay({
  pathInfo,
  isHighlightPersistent,
  showPointMarkers,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onStartPointClick,
  onEndPointClick,
  onPointCountClick,
}: PathInfoDisplayProps) {
  return (
    <div
      className={`status-path-info ${isHighlightPersistent ? 'highlight-active' : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      title={isHighlightPersistent ? 'Click to hide highlight' : 'Hover to highlight, click to lock'}
    >
      {pathInfo.color && (
        <span className="path-info-item">
          <span className="path-info-swatch" style={{ backgroundColor: pathInfo.color }} />
          {pathInfo.color}
        </span>
      )}
      {pathInfo.strokeWidth && (
        <span className="path-info-item">
          stroke: {pathInfo.strokeWidth}
        </span>
      )}
      <span
        className={`path-info-item clickable ${showPointMarkers === 'all' ? 'active' : ''}`}
        onClick={onPointCountClick}
        title="Click to show all points"
      >
        {pathInfo.pointCount} pts
      </span>
      <span
        className={`path-info-item clickable ${showPointMarkers === 'start' ? 'active' : ''}`}
        onClick={onStartPointClick}
        title="Click to show start point"
      >
        start: ({pathInfo.startPos.x.toFixed(1)}, {pathInfo.startPos.y.toFixed(1)})
      </span>
      <span
        className={`path-info-item clickable ${showPointMarkers === 'end' ? 'active' : ''}`}
        onClick={onEndPointClick}
        title="Click to show end point"
      >
        end: ({pathInfo.endPos.x.toFixed(1)}, {pathInfo.endPos.y.toFixed(1)})
      </span>
    </div>
  )
}

interface GroupInfoDisplayProps {
  groupInfo: GroupInfo
}

function GroupInfoDisplay({ groupInfo }: GroupInfoDisplayProps) {
  return (
    <div className="status-group-info">
      <span className="group-info-summary">
        {groupInfo.fillCount}F / {groupInfo.pathCount}P
      </span>
      {Object.entries(groupInfo.colorCounts).map(([color, counts]) => (
        <span key={color} className="group-color-item">
          <span className="path-info-swatch" style={{ backgroundColor: color }} />
          <span className="group-color-counts">
            {counts.fill > 0 && <span className="count-fill">{counts.fill}F</span>}
            {counts.path > 0 && <span className="count-path">{counts.path}P</span>}
          </span>
        </span>
      ))}
    </div>
  )
}

interface ColorStatsDisplayProps {
  colors: string[]
  stats: Map<string, ColorStats>
}

function ColorStatsDisplay({ colors, stats }: ColorStatsDisplayProps) {
  return (
    <div className="status-bar-colors">
      {colors.map((color, index) => {
        const colorStats = stats.get(color)
        return (
          <span
            key={index}
            className="color-stat-item"
            title={`${color} - ${colorStats?.paths || 0} paths, ${colorStats?.points || 0} points`}
          >
            <span
              className="color-swatch"
              style={{ backgroundColor: color }}
            />
            <span className="color-stat-counts">
              {colorStats?.paths || 0}/{colorStats?.points || 0}
            </span>
          </span>
        )
      })}
    </div>
  )
}
