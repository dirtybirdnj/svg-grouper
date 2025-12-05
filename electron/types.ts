/**
 * Shared types for electron main process and renderer communication
 */

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface HatchLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PolygonWithHoles {
  outer: Point[]
  holes: Point[][]
}

export interface FillPathInput {
  id: string
  color: string
  polygons: PolygonWithHoles[]
  rawSubpaths?: Point[][] // For evenodd mode
}

export interface FillGenerationParams {
  paths: FillPathInput[]
  boundingBox: Rect
  fillPattern: string
  lineSpacing: number
  angle: number
  crossHatch: boolean
  inset: number
  wiggleAmplitude: number
  wiggleFrequency: number
  spiralOverDiameter: number
  singleSpiral: boolean
  singleHilbert: boolean
  singleFermat: boolean
  customTileShape: string
  customTileGap: number
  customTileScale: number
  customTileRotateOffset: number
  enableCrop: boolean
  cropInset: number
  useEvenOdd: boolean // Use evenodd fill rule for compound paths
}

export interface FillPathResult {
  pathId: string
  lines: HatchLine[]
  polygon: Point[]
}

export interface FillGenerationResult {
  paths: FillPathResult[]
  success: boolean
  error?: string
}

export interface FillProgressData {
  progress: number
  status: string
}

export interface FileOpenedData {
  content: string
  fileName: string
  filePath: string
}

export interface ExportFilesArgs {
  files: { name: string; content: string }[]
  baseName: string
}

export interface CropSVGArgs {
  svg: string
  x: number
  y: number
  width: number
  height: number
}

export interface FlattenShapesArgs {
  svg: string
  color: string
}

export interface NormalizeSVGArgs {
  svg: string
}

export interface RatKingResult {
  success: boolean
  svg: string
}
