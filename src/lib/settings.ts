import type { RecognitionSettings } from '../types'

export const DEFAULT_RECOGNITION_SETTINGS: RecognitionSettings = {
  model: 'a9-cn',
  maxSpeed: 600,
  maxSpeedChangePerSecond: 260,
  localDeviation: 18,
  accelerationThreshold: 220,
  checks: {
    threeDigitRule: false,
    speedJump: true,
    localTrend: true,
    fillShortGaps: true,
    localMedian: true,
    accelerationSpike: true,
    detectCuts: false,
    neighborAgreement: true,
  },
}

const STORAGE_KEY = 'a9-telemetry-recognition-settings-v1'

export function loadRecognitionSettings(): RecognitionSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<RecognitionSettings>
    return {
      ...DEFAULT_RECOGNITION_SETTINGS,
      ...saved,
      checks: { ...DEFAULT_RECOGNITION_SETTINGS.checks, ...saved.checks },
    }
  } catch {
    return DEFAULT_RECOGNITION_SETTINGS
  }
}

export function saveRecognitionSettings(settings: RecognitionSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
