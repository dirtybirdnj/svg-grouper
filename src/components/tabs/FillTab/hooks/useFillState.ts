import { useState, useEffect } from 'react'
import { FillPatternType, TileShapeType } from '../../../../utils/fillPatterns'
import { SubpathMode } from '../../../../utils/geometry'
import { FillLayer, ControlId } from '../types'
import { WeavePattern } from '../weaveAlgorithm'

/**
 * Consolidated state management for FillTab.
 * Groups all useState hooks into a single hook for better organization.
 */
export function useFillState() {
  // Pattern settings
  const [lineSpacing, setLineSpacing] = useState(15)
  const [angle, setAngle] = useState(45)
  const [crossHatch, setCrossHatch] = useState(false)
  const [inset, setInset] = useState(0)
  const [retainStrokes, setRetainStrokes] = useState(true)
  const [penWidth, setPenWidth] = useState(0.5) // in mm
  const [showHatchPreview, setShowHatchPreview] = useState(false)
  const [fillPattern, setFillPattern] = useState<FillPatternType>('lines')

  // Wiggle/wave settings
  const [wiggleAmplitude, setWiggleAmplitude] = useState(5)
  const [wiggleFrequency, setWiggleFrequency] = useState(2)

  // Spiral settings
  const [spiralOverDiameter, setSpiralOverDiameter] = useState(2.0)
  const [singleSpiral, setSingleSpiral] = useState(false)
  const [singleHilbert, setSingleHilbert] = useState(true)
  const [singleFermat, setSingleFermat] = useState(true)

  // Simplification
  const [simplifyTolerance, setSimplifyTolerance] = useState(0)

  // Custom tile settings
  const [customTileShape, setCustomTileShape] = useState<TileShapeType>('triangle')
  const [customTileGap, setCustomTileGap] = useState(0)
  const [customTileScale, setCustomTileScale] = useState(1.0)
  const [customTileRotateOffset, setCustomTileRotateOffset] = useState(0)

  // Subpath mode (currently always 'default')
  const [subpathMode] = useState<SubpathMode>('default')

  // Evenodd fill rule is always enabled
  const useEvenOdd = true

  // Merge shapes before fill
  const [mergeBeforeFill, setMergeBeforeFill] = useState(false)

  // Crop settings
  const [enableCrop, setEnableCrop] = useState(false)
  const [cropInset, setCropInset] = useState(0)
  const [draftCropInset, setDraftCropInset] = useState(0)

  // Accumulated layers
  const [accumulatedLayers, setAccumulatedLayers] = useState<FillLayer[]>([])
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [layerColor, setLayerColor] = useState<string>('')
  const [bannerCache, setBannerCache] = useState<Map<string, string>>(new Map())
  const [highlightedPathId] = useState<string | null>(null)
  const [newLayerAngle, setNewLayerAngle] = useState(45)
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(new Set())

  // Weave settings
  const [weavePattern, setWeavePattern] = useState<WeavePattern>('trueWeave')
  const [weaveGapMargin, setWeaveGapMargin] = useState(0.5)

  // Draft states for sliders - show value during drag, commit on release
  const [draftLineSpacing, setDraftLineSpacing] = useState(15)
  const [draftAngle, setDraftAngle] = useState(45)
  const [draftInset, setDraftInset] = useState(0)
  const [draftWiggleAmplitude, setDraftWiggleAmplitude] = useState(5)
  const [draftWiggleFrequency, setDraftWiggleFrequency] = useState(2)
  const [draftPenWidth, setDraftPenWidth] = useState(0.5)
  const [draftSimplifyTolerance, setDraftSimplifyTolerance] = useState(0)
  const [draftLayerColor, setDraftLayerColor] = useState<string>('')

  // Selected control for keyboard nudge
  const [selectedControl, setSelectedControl] = useState<ControlId>(null)

  // Sync draft states when actual values change programmatically
  useEffect(() => {
    setDraftLineSpacing(lineSpacing)
    setDraftAngle(angle)
    setDraftInset(inset)
    setDraftWiggleAmplitude(wiggleAmplitude)
    setDraftWiggleFrequency(wiggleFrequency)
    setDraftPenWidth(penWidth)
    setDraftSimplifyTolerance(simplifyTolerance)
    setDraftCropInset(cropInset)
    setDraftLayerColor(layerColor)
  }, [lineSpacing, angle, inset, wiggleAmplitude, wiggleFrequency, penWidth, simplifyTolerance, cropInset, layerColor])

  return {
    // Pattern settings
    lineSpacing, setLineSpacing,
    angle, setAngle,
    crossHatch, setCrossHatch,
    inset, setInset,
    retainStrokes, setRetainStrokes,
    penWidth, setPenWidth,
    showHatchPreview, setShowHatchPreview,
    fillPattern, setFillPattern,

    // Wiggle settings
    wiggleAmplitude, setWiggleAmplitude,
    wiggleFrequency, setWiggleFrequency,

    // Spiral settings
    spiralOverDiameter, setSpiralOverDiameter,
    singleSpiral, setSingleSpiral,
    singleHilbert, setSingleHilbert,
    singleFermat, setSingleFermat,

    // Simplification
    simplifyTolerance, setSimplifyTolerance,

    // Custom tile settings
    customTileShape, setCustomTileShape,
    customTileGap, setCustomTileGap,
    customTileScale, setCustomTileScale,
    customTileRotateOffset, setCustomTileRotateOffset,

    // Mode settings
    subpathMode,
    useEvenOdd,
    mergeBeforeFill, setMergeBeforeFill,

    // Crop settings
    enableCrop, setEnableCrop,
    cropInset, setCropInset,
    draftCropInset, setDraftCropInset,

    // Layer state
    accumulatedLayers, setAccumulatedLayers,
    selectedLayerId, setSelectedLayerId,
    layerColor, setLayerColor,
    bannerCache, setBannerCache,
    highlightedPathId,
    newLayerAngle, setNewLayerAngle,
    selectedLayerIds, setSelectedLayerIds,

    // Weave settings
    weavePattern, setWeavePattern,
    weaveGapMargin, setWeaveGapMargin,

    // Draft states
    draftLineSpacing, setDraftLineSpacing,
    draftAngle, setDraftAngle,
    draftInset, setDraftInset,
    draftWiggleAmplitude, setDraftWiggleAmplitude,
    draftWiggleFrequency, setDraftWiggleFrequency,
    draftPenWidth, setDraftPenWidth,
    draftSimplifyTolerance, setDraftSimplifyTolerance,
    draftLayerColor, setDraftLayerColor,

    // Selected control
    selectedControl, setSelectedControl,
  }
}

export type FillState = ReturnType<typeof useFillState>
