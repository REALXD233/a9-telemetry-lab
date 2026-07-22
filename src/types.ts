export type RegionKind = 'speed' | 'timer'
export type RecognitionModel = 'default' | 'a9-cn'
export type DataPreference = 'corrected' | 'raw'
export type DataDisplayMode = 'both' | DataPreference

export interface SpeedCheckSettings {
  speedJump: boolean
  localTrend: boolean
  fillShortGaps: boolean
  localMedian: boolean
  neighborAgreement: boolean
}

export interface RecognitionSettings {
  model: RecognitionModel
  maxSpeed: number
  maxSpeedChangePerFrame: number
  localDeviation: number
  checks: SpeedCheckSettings
}

export interface CropRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface TelemetryPoint {
  id: string
  gameTime: string
  timeSeconds: number
  speed: number
  videoTime: number
  source: '手动' | 'OCR' | '模型+OCR'
  /** 手动确认的真值。自动识别、时间修复和异常速度修复都不得覆盖。 */
  locked?: boolean
  confidence?: number
  rawGameTime?: string
  corrected?: boolean
  rawSpeed?: number
  speedCorrected?: boolean
  speedCorrectionReason?: '异常点插值修正' | '5/9 易混淆校正' | '速度阈值' | '相邻帧偏差校验' | '片段中值校验' | '漏识别点填补' | '人工确认'
}

export interface OcrResult {
  raw: string
  value: string | null
  confidence: number
  engine?: 'tesseract' | 'speed-model'
}
