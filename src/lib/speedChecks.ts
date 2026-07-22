import type { RecognitionSettings, TelemetryPoint } from '../types'
import { normalizeGameTime } from './time'

export function correctSpeedOutliers(points: TelemetryPoint[], settings: RecognitionSettings) {
  if (points.length < 3) return { points, count: 0 }
  const result = points.map((point) => ({ ...point })).sort((a, b) => a.videoTime - b.videoTime)
  const medianStep = median(result.slice(1).map((point, index) => point.videoTime - result[index].videoTime).filter((value) => value > .0001))
  let count = 0

  for (const point of result) {
    if (!isLocked(point) && point.speed > settings.maxSpeed) {
      markCorrection(point, settings.maxSpeed, '速度跳变')
      count += 1
    }
  }

  if (settings.checks.localTrend) {
    for (let index = 1; index < result.length - 1; index += 1) {
      const current = result[index]
      if (isLocked(current) || !String(current.speed).includes('9')) continue
      const expected = interpolate(result[index - 1], result[index + 1], current.videoTime)
      const neighborSpread = Math.abs(result[index + 1].speed - result[index - 1].speed)
      if (settings.checks.neighborAgreement && neighborSpread > settings.localDeviation) continue
      const best = fiveNineAlternatives(current.speed).sort((a, b) => Math.abs(a - expected) - Math.abs(b - expected))[0]
      if (best == null) continue
      if (Math.abs(best - expected) <= settings.localDeviation && Math.abs(current.speed - expected) - Math.abs(best - expected) >= 3) {
        markCorrection(current, best, '5/9 混淆')
        count += 1
      }
    }
  }

  for (let index = 2; index < result.length - 2; index += 1) {
    const current = result[index]
    if (isLocked(current)) continue
    const left = result[index - 1]
    const right = result[index + 1]
    const dtLeft = Math.max(.001, current.videoTime - left.videoTime)
    const dtRight = Math.max(.001, right.videoTime - current.videoTime)
    if (settings.checks.detectCuts && medianStep > 0 && (dtLeft > medianStep * 2.6 || dtRight > medianStep * 2.6)) continue

    const expected = interpolate(left, right, current.videoTime)
    const localValues = result.slice(index - 2, index + 3).map((point) => point.speed).sort((a, b) => a - b)
    const localMedian = localValues[2]
    const deviation = Math.abs(current.speed - expected)
    const neighborSpread = Math.abs(right.speed - left.speed)
    if (settings.checks.neighborAgreement && neighborSpread > Math.max(settings.localDeviation, expected * .12)) continue

    let reason: TelemetryPoint['speedCorrectionReason'] | null = null
    if (settings.checks.threeDigitRule && current.speed < 100 && left.speed >= 100 && right.speed >= 100) reason = '三位数规则'
    if (!reason && settings.checks.speedJump) {
      const leftRate = Math.abs(current.speed - left.speed) / dtLeft
      const rightRate = Math.abs(right.speed - current.speed) / dtRight
      if (leftRate > settings.maxSpeedChangePerSecond && rightRate > settings.maxSpeedChangePerSecond) reason = '速度跳变'
    }
    if (!reason && settings.checks.localMedian && Math.abs(current.speed - localMedian) > settings.localDeviation && deviation > settings.localDeviation) reason = '局部中位数'
    if (!reason && settings.checks.accelerationSpike) {
      const leftAcceleration = (current.speed - left.speed) / dtLeft
      const rightAcceleration = (right.speed - current.speed) / dtRight
      if (Math.abs(rightAcceleration - leftAcceleration) > settings.accelerationThreshold && deviation > settings.localDeviation) reason = '加速度突变'
    }
    if (reason) {
      markCorrection(current, Math.round(expected), reason)
      count += 1
    }
  }

  const withGaps = settings.checks.fillShortGaps && medianStep > 0
    ? fillShortGaps(result, medianStep, settings, () => { count += 1 })
    : result
  return { points: withGaps, count }
}

function fillShortGaps(points: TelemetryPoint[], step: number, settings: RecognitionSettings, onInsert: () => void) {
  const filled: TelemetryPoint[] = []
  for (let index = 0; index < points.length; index += 1) {
    const left = points[index]
    const right = points[index + 1]
    filled.push(left)
    if (!right) continue
    const gap = right.videoTime - left.videoTime
    const missing = Math.round(gap / step) - 1
    if (missing < 1 || missing > 2 || gap > step * 3.4) continue
    if (settings.checks.detectCuts && Math.abs(right.speed - left.speed) > settings.localDeviation * 2) continue
    for (let offset = 1; offset <= missing; offset += 1) {
      const ratio = offset / (missing + 1)
      const videoTime = left.videoTime + gap * ratio
      const timeSeconds = left.timeSeconds + (right.timeSeconds - left.timeSeconds) * ratio
      filled.push({
        id: crypto.randomUUID(),
        gameTime: normalizeGameTime(timeSeconds),
        timeSeconds,
        speed: Math.round(left.speed + (right.speed - left.speed) * ratio),
        videoTime,
        source: 'OCR',
        confidence: Math.min(left.confidence ?? 0, right.confidence ?? 0),
        corrected: true,
        speedCorrected: true,
        speedCorrectionReason: '短缺插值',
      })
      onInsert()
    }
  }
  return filled.sort((a, b) => a.videoTime - b.videoTime)
}

function interpolate(left: TelemetryPoint, right: TelemetryPoint, videoTime: number) {
  const span = right.videoTime - left.videoTime
  const ratio = span > 0 ? (videoTime - left.videoTime) / span : .5
  return Math.max(0, left.speed + (right.speed - left.speed) * ratio)
}

function markCorrection(point: TelemetryPoint, speed: number, reason: NonNullable<TelemetryPoint['speedCorrectionReason']>) {
  point.rawSpeed ??= point.speed
  point.speed = Math.max(0, Math.round(speed))
  point.speedCorrected = true
  point.speedCorrectionReason = reason
}

function fiveNineAlternatives(speed: number) {
  const source = String(Math.round(speed))
  let variants = new Set([source])
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '9') continue
    variants = new Set([...variants, ...[...variants].map((value) => `${value.slice(0, index)}5${value.slice(index + 1)}`)])
  }
  variants.delete(source)
  return [...variants].map(Number).filter(Number.isFinite)
}

function isLocked(point: TelemetryPoint) {
  return point.locked === true || point.source === '手动'
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
