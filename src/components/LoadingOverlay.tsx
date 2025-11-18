import './LoadingOverlay.css'

interface LoadingOverlayProps {
  progress: number
  status: string
  estimatedTimeLeft?: number
}

export default function LoadingOverlay({ progress, status, estimatedTimeLeft }: LoadingOverlayProps) {
  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="loading-spinner">
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="#e0e0e0"
              strokeWidth="4"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="#4a90e2"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 28}`}
              strokeDashoffset={`${2 * Math.PI * 28 * (1 - progress / 100)}`}
              transform="rotate(-90 32 32)"
              style={{ transition: 'stroke-dashoffset 0.3s ease' }}
            />
          </svg>
          <div className="progress-text">{Math.round(progress)}%</div>
        </div>

        <h3 className="loading-status">{status}</h3>

        {estimatedTimeLeft !== undefined && estimatedTimeLeft > 0 && (
          <p className="time-remaining">
            {formatTime(estimatedTimeLeft)} remaining
          </p>
        )}
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  if (seconds < 1) return 'Less than a second'
  if (seconds < 60) return `${Math.round(seconds)} seconds`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  if (remainingSeconds === 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`
  return `${minutes}m ${remainingSeconds}s`
}
