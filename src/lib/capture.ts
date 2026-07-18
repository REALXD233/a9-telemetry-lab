import type { CropRegion, OcrResult } from '../types'
import type { LayersModel, Tensor } from '@tensorflow/tfjs'

let workerPromise: ReturnType<typeof createDigitWorker> | null = null
let speedModelPromise: Promise<LayersModel> | null = null

const SPEED_MODEL_WIDTH = 140
const SPEED_MODEL_HEIGHT = 72
const SPEED_SLOT_WIDTH = 44
const SPEED_RIGHT_EDGE = 134

async function createDigitWorker() {
  const { createWorker } = await import('tesseract.js')
  return createWorker('eng')
}

export async function cancelDigitRecognition() {
  const pendingWorker = workerPromise
  workerPromise = null
  if (!pendingWorker) return
  try {
    const worker = await pendingWorker
    await worker.terminate()
  } catch {
    // Worker initialization or recognition may already have been interrupted.
  }
}

export function captureRegion(video: HTMLVideoElement, region: CropRegion): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const sx = Math.max(0, Math.round(region.x * video.videoWidth))
  const sy = Math.max(0, Math.round(region.y * video.videoHeight))
  const sw = Math.max(1, Math.round(region.width * video.videoWidth))
  const sh = Math.max(1, Math.round(region.height * video.videoHeight))
  const scale = Math.max(2, Math.min(4, 800 / sw))
  canvas.width = Math.round(sw * scale)
  canvas.height = Math.round(sh * scale)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('浏览器无法创建画布')
  context.filter = 'grayscale(1) contrast(2.2) brightness(1.08)'
  context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function captureFrameSignature(video: HTMLVideoElement) {
  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 27
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const signature = new Uint8Array(canvas.width * canvas.height)
  for (let source = 0, target = 0; source < pixels.length; source += 4, target += 1) {
    signature[target] = Math.round(pixels[source] * .299 + pixels[source + 1] * .587 + pixels[source + 2] * .114)
  }
  return signature
}

export function isRepeatedFrame(previous: Uint8Array | null, current: Uint8Array | null) {
  if (!previous || !current || previous.length !== current.length) return false
  let difference = 0
  let changed = 0
  for (let index = 0; index < current.length; index += 1) {
    const delta = Math.abs(current[index] - previous[index])
    difference += delta
    if (delta >= 4) changed += 1
  }
  const meanDifference = difference / current.length
  const changedRatio = changed / current.length
  return meanDifference <= .35 || (meanDifference <= 1.1 && changedRatio <= .05)
}

export async function recognizeDigits(canvas: HTMLCanvasElement, kind: 'speed' | 'timer', thorough = true): Promise<OcrResult> {
  const { PSM } = await import('tesseract.js')
  workerPromise ??= createDigitWorker()
  const worker = await workerPromise
  await worker.setParameters({
    tessedit_char_whitelist: kind === 'speed' ? '0123456789' : '0123456789:.',
    preserve_interword_spaces: '0',
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
  })
  const variants = thorough ? [canvas, thresholdCanvas(canvas, false), thresholdCanvas(canvas, true)] : [thresholdCanvas(canvas, false)]
  const candidates: OcrResult[] = []
  for (const variant of variants) {
    const result = await worker.recognize(variant)
    const raw = result.data.text.trim().replace(/\s/g, '')
    const value = extractValue(raw, kind)
    candidates.push({ raw, value, confidence: result.data.confidence, engine: 'tesseract' })
  }
  const groups = new Map<string, OcrResult[]>()
  for (const candidate of candidates) {
    const key = candidate.value ?? `invalid:${candidate.raw}`
    groups.set(key, [...(groups.get(key) ?? []), candidate])
  }
  return [...groups.values()].sort((a, b) => groupScore(b, kind) - groupScore(a, kind))[0]
    .sort((a, b) => b.confidence - a.confidence)[0]
}

async function loadSpeedModel() {
  speedModelPromise ??= import('@tensorflow/tfjs').then((tf) => tf.loadLayersModel(`${import.meta.env.BASE_URL}models/speed-digits/model.json`))
  return speedModelPromise
}

export async function recognizeSpeedDigits(video: HTMLVideoElement, region: CropRegion): Promise<OcrResult> {
  const tf = await import('@tensorflow/tfjs')
  const model = await loadSpeedModel()
  const roi = captureRawRegion(video, region, SPEED_MODEL_WIDTH, SPEED_MODEL_HEIGHT)
  const slots = Array.from({ length: 3 }, (_, position) => {
    const canvas = document.createElement('canvas')
    canvas.width = SPEED_SLOT_WIDTH
    canvas.height = SPEED_MODEL_HEIGHT
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('浏览器无法创建速度数字画布')
    const left = SPEED_RIGHT_EDGE - 3 * SPEED_SLOT_WIDTH + position * SPEED_SLOT_WIDTH
    context.drawImage(roi, left, 0, SPEED_SLOT_WIDTH, SPEED_MODEL_HEIGHT, 0, 0, SPEED_SLOT_WIDTH, SPEED_MODEL_HEIGHT)
    return canvas
  })

  const tensors = slots.map((slot) => tf.browser.fromPixels(slot, 3).toFloat())
  const batch = tf.stack(tensors)
  const prediction = model.predict(batch) as Tensor
  const probabilities = await prediction.array() as number[][]
  tensors.forEach((tensor) => tensor.dispose())
  batch.dispose()
  prediction.dispose()

  const digits = probabilities.map((values) => values.indexOf(Math.max(...values)))
  const digitConfidence = probabilities.map((values) => Math.max(...values))
  const activeFrom = firstActiveSlot(slots)
  const raw = digits.slice(activeFrom).join('')
  const numeric = Number(raw)
  const confidence = digitConfidence.slice(activeFrom).reduce((sum, value) => sum + value, 0)
    / Math.max(1, digitConfidence.length - activeFrom) * 100
  return {
    raw,
    value: Number.isInteger(numeric) && numeric >= 0 && numeric <= 600 ? raw : null,
    confidence,
    engine: 'speed-model',
  }
}

function captureRawRegion(video: HTMLVideoElement, region: CropRegion, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('浏览器无法创建画布')
  const sx = Math.max(0, Math.round(region.x * video.videoWidth))
  const sy = Math.max(0, Math.round(region.y * video.videoHeight))
  const sw = Math.max(1, Math.round(region.width * video.videoWidth))
  const sh = Math.max(1, Math.round(region.height * video.videoHeight))
  context.drawImage(video, sx, sy, sw, sh, 0, 0, width, height)
  return canvas
}

function firstActiveSlot(slots: HTMLCanvasElement[]) {
  const ratios = slots.map((slot) => {
    const context = slot.getContext('2d', { willReadFrequently: true })!
    const pixels = context.getImageData(0, 0, slot.width, slot.height).data
    let bright = 0
    for (let index = 0; index < pixels.length; index += 4) {
      if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) >= 180) bright += 1
    }
    return bright / (slot.width * slot.height)
  })
  if (ratios[0] < .1 && ratios[1] >= .1) return 1
  if (ratios[0] < .1 && ratios[1] < .1) return 2
  return 0
}

function extractValue(raw: string, kind: 'speed' | 'timer') {
  if (kind === 'speed') {
    const values = raw.match(/\d{1,3}/g)?.map(Number).filter((value) => value >= 0 && value <= 600)
    return values?.length ? String(Math.max(...values)) : null
  }
  const cleaned = raw.replace(/[,，]/g, '.').replace(/[^\d:.]/g, '')
  const match = cleaned.match(/\d{1,2}[:.]\d{2}(?:[:.]\d{1,3})?/) ?? cleaned.match(/\d{1,3}[.:]\d{1,3}/)
  if (!match) return null
  const parts = match[0].split(/[:.]/)
  if (parts.length >= 3) return `${parts[0]}:${parts[1]}.${parts.slice(2).join('').slice(0, 3)}`
  return match[0].replace('.', ':')
}

function score(result: OcrResult, kind: 'speed' | 'timer') {
  if (!result.value) return result.confidence - 100
  const formatBonus = kind === 'timer' && /[:.]/.test(result.value) ? 25 : 15
  return result.confidence + formatBonus
}

function groupScore(results: OcrResult[], kind: 'speed' | 'timer') {
  const average = results.reduce((sum, result) => sum + score(result, kind), 0) / results.length
  return average + (results[0].value ? results.length * 100 : -100)
}

function thresholdCanvas(source: HTMLCanvasElement, invert: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(source, 0, 0)
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const histogram = new Array<number>(256).fill(0)
  for (let i = 0; i < image.data.length; i += 4) histogram[image.data[i]] += 1
  const threshold = otsuThreshold(histogram, canvas.width * canvas.height)
  for (let i = 0; i < image.data.length; i += 4) {
    const on = image.data[i] >= threshold
    const value = (invert ? !on : on) ? 255 : 0
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value
  }
  context.putImageData(image, 0, 0)
  return canvas
}

function otsuThreshold(histogram: number[], total: number) {
  let sum = 0
  histogram.forEach((count, value) => { sum += value * count })
  let sumBackground = 0
  let weightBackground = 0
  let maximum = 0
  let threshold = 128
  histogram.forEach((count, value) => {
    weightBackground += count
    if (!weightBackground) return
    const weightForeground = total - weightBackground
    if (!weightForeground) return
    sumBackground += value * count
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sum - sumBackground) / weightForeground
    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2
    if (between > maximum) { maximum = between; threshold = value }
  })
  return threshold
}
