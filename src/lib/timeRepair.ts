import type { TelemetryPoint } from '../types'
import { normalizeGameTime } from './time'

export interface RawTelemetryCapture {
  videoTime: number
  speed: number
  source: TelemetryPoint['source']
  confidence: number
  rawGameTime: string
  parsedTime: number | null
}

export function repairCapturedTimes(rawPoints: RawTelemetryCapture[], references: TelemetryPoint[], fps: number) {
  const manualAnchors = references
    .filter((point) => isLocked(point) && Number.isFinite(point.timeSeconds))
    .sort((a, b) => a.videoTime - b.videoTime)
  const referenceOffsets = (manualAnchors.length ? manualAnchors : references
    .filter((point) => !point.corrected && Number.isFinite(point.timeSeconds)))
    .map((point) => point.timeSeconds - point.videoTime)
  const observedOffsets = rawPoints
    .filter((point): point is RawTelemetryCapture & { parsedTime: number } => point.parsedTime != null)
    .map((point) => point.parsedTime - point.videoTime)
  const offsets = [...referenceOffsets, ...observedOffsets]
  if (!offsets.length) return { points: [] as TelemetryPoint[], correctedCount: 0, tolerance: 0 }

  const initialCenter = median(offsets)
  const deviations = offsets.map((offset) => Math.abs(offset - initialCenter))
  const mad = median(deviations)
  const baseTolerance = Math.max(.045, 1.75 / Math.max(1, fps))
  const clusterTolerance = Math.min(.08, Math.max(baseTolerance, mad * 4))
  const stableOffsets = offsets.filter((offset) => Math.abs(offset - initialCenter) <= clusterTolerance)
  const stableOffset = median(stableOffsets.length ? stableOffsets : offsets)
  let correctedCount = 0

  const points = [...rawPoints]
    .sort((a, b) => a.videoTime - b.videoTime)
    .map((raw): TelemetryPoint | null => {
      const expected = expectedFromAnchors(raw.videoTime, manualAnchors, stableOffset)
      if (expected < 0) return null
      const recognizedIsStable = raw.parsedTime != null
        && Math.abs(raw.parsedTime - expected) <= clusterTolerance
      const timeSeconds = recognizedIsStable ? raw.parsedTime! : expected
      if (!recognizedIsStable) correctedCount += 1
      return {
        id: crypto.randomUUID(),
        gameTime: normalizeGameTime(timeSeconds),
        timeSeconds,
        speed: raw.speed,
        videoTime: raw.videoTime,
        source: raw.source,
        confidence: raw.confidence,
        rawGameTime: raw.rawGameTime || undefined,
        corrected: !recognizedIsStable,
      }
    })
    .filter((point): point is TelemetryPoint => point != null)

  return { points, correctedCount, tolerance: clusterTolerance }
}

function isLocked(point: TelemetryPoint) {
  return point.locked === true || point.source === '手动'
}

/**
 * 手动点是绝对锚点：两点之间按它们的真实斜率插值；只有单侧锚点时按
 * 视频时间 1:1 外推。这样某一帧 OCR 出错不会改变后续帧的时间基准。
 */
function expectedFromAnchors(videoTime: number, anchors: TelemetryPoint[], fallbackOffset: number) {
  if (!anchors.length) return videoTime + fallbackOffset
  let rightIndex = anchors.findIndex((point) => point.videoTime >= videoTime)
  if (rightIndex < 0) rightIndex = anchors.length
  const left = anchors[rightIndex - 1]
  const right = anchors[rightIndex]
  if (left && right && right.videoTime > left.videoTime) {
    const ratio = (videoTime - left.videoTime) / (right.videoTime - left.videoTime)
    return left.timeSeconds + (right.timeSeconds - left.timeSeconds) * ratio
  }
  if (left) return left.timeSeconds + (videoTime - left.videoTime)
  return right.timeSeconds - (right.videoTime - videoTime)
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
