import type { TelemetryPoint } from '../types'
import { normalizeGameTime } from './time'

export interface RawTelemetryCapture {
  videoTime: number
  speed: number
  source: TelemetryPoint['source']
  confidence: number
  timerConfidence: number
  rawGameTime: string
  parsedTime: number | null
}

export function repairCapturedTimes(rawPoints: RawTelemetryCapture[], references: TelemetryPoint[], fps: number) {
  const manualAnchors = references
    .filter((point) => isLocked(point) && Number.isFinite(point.timeSeconds))
    .sort((a, b) => a.videoTime - b.videoTime)
  const referenceOffsets = (manualAnchors.length ? manualAnchors : references
    .filter((point) => !point.corrected && Number.isFinite(point.timeSeconds)))
    .map((point) => ({ value: point.timeSeconds - point.videoTime, weight: isLocked(point) ? 20 : 3 }))
  const observedOffsets = rawPoints
    .filter((point): point is RawTelemetryCapture & { parsedTime: number } => point.parsedTime != null)
    .map((point) => ({
      value: point.parsedTime - point.videoTime,
      weight: Math.max(.12, Math.min(1, point.timerConfidence / 100)) ** 2,
    }))
  const offsetSamples = [...referenceOffsets, ...observedOffsets]
  if (!offsetSamples.length) return { points: [] as TelemetryPoint[], correctedCount: 0, tolerance: 0 }

  const baseTolerance = Math.min(.07, Math.max(.04, 2 / Math.max(1, fps)))
  const clusterRadius = Math.min(.07, Math.max(.05, 2.5 / Math.max(1, fps)))
  const stableOffset = densestWeightedCenter(offsetSamples, clusterRadius)
  const stableResiduals = offsetSamples
    .filter((sample) => Math.abs(sample.value - stableOffset) <= clusterRadius)
    .map((sample) => Math.abs(sample.value - stableOffset))
  const mad = median(stableResiduals)
  const clusterTolerance = Math.min(.07, Math.max(baseTolerance, mad * 3))
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
        rawSpeed: raw.speed,
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

function densestWeightedCenter(samples: { value: number; weight: number }[], radius: number) {
  let bestCenter = samples[0].value
  let bestScore = Number.NEGATIVE_INFINITY
  for (const candidate of samples) {
    const score = samples.reduce((sum, sample) => {
      const distance = Math.abs(sample.value - candidate.value)
      return distance > radius ? sum : sum + sample.weight * (1.2 - distance / radius)
    }, 0)
    if (score > bestScore) {
      bestScore = score
      bestCenter = candidate.value
    }
  }
  const inliers = samples.filter((sample) => Math.abs(sample.value - bestCenter) <= radius)
  return weightedMedian(inliers.length ? inliers : samples)
}

function weightedMedian(samples: { value: number; weight: number }[]) {
  const sorted = [...samples].sort((a, b) => a.value - b.value)
  const half = sorted.reduce((sum, sample) => sum + sample.weight, 0) / 2
  let cumulative = 0
  for (const sample of sorted) {
    cumulative += sample.weight
    if (cumulative >= half) return sample.value
  }
  return sorted.at(-1)?.value ?? 0
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
