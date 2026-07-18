export type RegionKind = 'speed' | 'timer'

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
  speedCorrectionReason?: '突变插值' | '5/9 混淆'
}

export interface OcrResult {
  raw: string
  value: string | null
  confidence: number
  engine?: 'tesseract' | 'speed-model'
}
