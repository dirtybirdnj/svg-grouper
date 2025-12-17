import { useCallback, useState } from 'react'
import ImportDialog from './ImportDialog'
import './FileUpload.css'

interface FileUploadProps {
  onFileLoad: (content: string, fileName: string, dimensions?: { width: number; height: number }) => void
  onLoadStart?: () => void
  onProgress?: (progress: number, status: string) => void
  onLoadError?: (error: string) => void
  onLoadCancel?: () => void
}

export default function FileUpload({ onFileLoad, onLoadStart, onProgress, onLoadError, onLoadCancel }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<{ content: string; fileName: string } | null>(null)

  const validateAndLoadFile = useCallback((file: File) => {
    setError(null)

    if (!file.name.toLowerCase().endsWith('.svg')) {
      setError('Please upload an SVG file')
      return
    }

    if (file.size > 100 * 1024 * 1024) { // 100MB limit
      setError('File is too large (max 100MB)')
      return
    }

    onLoadStart?.()
    onProgress?.(0, 'Reading file...')

    const reader = new FileReader()

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentLoaded = (e.loaded / e.total) * 100
        onProgress?.(percentLoaded, 'Reading file...')
      }
    }

    reader.onload = (e) => {
      const content = e.target?.result as string

      // Basic SVG validation - case insensitive, handles BOM/whitespace
      const contentLower = content.toLowerCase()
      if (!contentLower.includes('<svg')) {
        const errorMsg = 'File does not appear to be a valid SVG (no <svg> tag found)'
        setError(errorMsg)
        onLoadError?.(errorMsg)
        return
      }

      onProgress?.(100, 'File loaded')
      // Show import dialog instead of immediately loading
      setPendingFile({ content, fileName: file.name })
    }

    reader.onerror = () => {
      const errorMsg = 'Failed to read file'
      setError(errorMsg)
      onLoadError?.(errorMsg)
    }

    reader.readAsText(file)
  }, [onFileLoad, onLoadStart, onProgress, onLoadError])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      validateAndLoadFile(file)
    }
  }, [validateAndLoadFile])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      validateAndLoadFile(file)
    }
  }, [validateAndLoadFile])

  const handleClick = () => {
    document.getElementById('file-input')?.click()
  }

  const handleImportConfirm = useCallback((processedContent: string, dimensions: { width: number; height: number }) => {
    if (pendingFile) {
      onFileLoad(processedContent, pendingFile.fileName, dimensions)
      setPendingFile(null)
    }
  }, [pendingFile, onFileLoad])

  const handleImportCancel = useCallback(() => {
    setPendingFile(null)
    onLoadCancel?.()
  }, [onLoadCancel])

  return (
    <div className="file-upload-container">
      <div
        className={`file-upload-dropzone ${isDragging ? 'dragging' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <div className="upload-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <h3>Drop SVG file here</h3>
        <p>or click to browse</p>
      </div>

      {error && (
        <div className="upload-error">
          {error}
        </div>
      )}

      <input
        id="file-input"
        type="file"
        accept=".svg,image/svg+xml"
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />

      {pendingFile && (
        <ImportDialog
          svgContent={pendingFile.content}
          fileName={pendingFile.fileName}
          onConfirm={handleImportConfirm}
          onCancel={handleImportCancel}
        />
      )}
    </div>
  )
}
