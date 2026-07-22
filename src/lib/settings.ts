import type { RecognitionSettings, SpeedCheckSettings } from '../types'

export const DEFAULT_RECOGNITION_SETTINGS: RecognitionSettings = {
  model: 'a9-cn',
  maxSpeed: 600,
  maxSpeedChangePerFrame: 35,
  localDeviation: 18,
  checks: {
    speedJump: true,
    localTrend: true,
    fillShortGaps: true,
    localMedian: true,
    neighborAgreement: true,
  },
}

const STORAGE_KEY = 'a9-telemetry-recognition-settings-v2'

export function loadRecognitionSettings(): RecognitionSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<RecognitionSettings>
    const savedChecks = (saved.checks ?? {}) as Partial<SpeedCheckSettings>
    return {
      model: saved.model === 'default' ? 'default' : 'a9-cn',
      maxSpeed: finiteOr(saved.maxSpeed, DEFAULT_RECOGNITION_SETTINGS.maxSpeed),
      maxSpeedChangePerFrame: finiteOr(saved.maxSpeedChangePerFrame, DEFAULT_RECOGNITION_SETTINGS.maxSpeedChangePerFrame),
      localDeviation: finiteOr(saved.localDeviation, DEFAULT_RECOGNITION_SETTINGS.localDeviation),
      checks: {
        speedJump: booleanOr(savedChecks.speedJump, DEFAULT_RECOGNITION_SETTINGS.checks.speedJump),
        localTrend: booleanOr(savedChecks.localTrend, DEFAULT_RECOGNITION_SETTINGS.checks.localTrend),
        fillShortGaps: booleanOr(savedChecks.fillShortGaps, DEFAULT_RECOGNITION_SETTINGS.checks.fillShortGaps),
        localMedian: booleanOr(savedChecks.localMedian, DEFAULT_RECOGNITION_SETTINGS.checks.localMedian),
        neighborAgreement: booleanOr(savedChecks.neighborAgreement, DEFAULT_RECOGNITION_SETTINGS.checks.neighborAgreement),
      },
    }
  } catch {
    return DEFAULT_RECOGNITION_SETTINGS
  }
}

export function saveRecognitionSettings(settings: RecognitionSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function finiteOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

function booleanOr(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}
