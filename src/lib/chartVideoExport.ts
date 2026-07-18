import { safeFileName } from './export'
import { transcodeRecordingToMp4 } from './videoCompat'

export interface ChartVideoPoint {
  time: number
  speed: number
}

export interface ChartVideoSeries {
  name: string
  color: string
  points: ChartVideoPoint[]
}

export interface ChartVideoProgress {
  stage: 'recording' | 'encoding'
  ratio: number
}

interface Options {
  fileName: string
  playbackRate: number
  timeLabel: string
  fps?: number
}

const WIDTH = 1280
const HEIGHT = 720
const PADDING = { left: 92, right: 330, top: 118, bottom: 92 }

export async function exportComparisonVideo(
  series: ChartVideoSeries[],
  options: Options,
  onProgress: (progress: ChartVideoProgress) => void,
) {
  const cleanSeries = series
    .map((item) => ({ ...item, points: [...item.points].sort((a, b) => a.time - b.time) }))
    .filter((item) => item.points.length)
  if (!cleanSeries.length) throw new Error('没有可导出的视频数据')
  if (typeof MediaRecorder === 'undefined') throw new Error('当前浏览器不支持视频录制，请使用最新版 Edge 或 Chrome')

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  if (typeof canvas.captureStream !== 'function') throw new Error('当前浏览器不支持画布视频导出，请使用桌面版 Edge 或 Chrome')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法创建视频画布')

  const allPoints = cleanSeries.flatMap((item) => item.points)
  const minTime = Math.min(...allPoints.map((point) => point.time))
  const maxTime = Math.max(...allPoints.map((point) => point.time))
  const maxSpeed = Math.max(100, ...allPoints.map((point) => point.speed))
  const fps = Math.max(24, Math.min(60, options.fps ?? 30))
  const playbackRate = Math.max(.25, Math.min(16, options.playbackRate))
  const introSeconds = .55
  const animationSeconds = Math.max(.5, (maxTime - minTime) / playbackRate)
  const outroSeconds = .75
  const totalSeconds = introSeconds + animationSeconds + outroSeconds

  drawFrame(context, cleanSeries, minTime, minTime, maxTime, maxSpeed, options.timeLabel, 0)
  const mimeType = selectRecorderMimeType()
  const stream = canvas.captureStream(fps)
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  const recording = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data) })
    recorder.addEventListener('error', (event) => reject((event as Event & { error?: DOMException }).error ?? new Error('动态图录制失败')), { once: true })
    recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType })), { once: true })
  })

  recorder.start(250)
  const startedAt = performance.now()
  try {
    while (true) {
      const elapsed = (performance.now() - startedAt) / 1000
      const animationProgress = Math.max(0, Math.min(1, (elapsed - introSeconds) / animationSeconds))
      const currentTime = minTime + (maxTime - minTime) * animationProgress
      drawFrame(context, cleanSeries, currentTime, minTime, maxTime, maxSpeed, options.timeLabel, animationProgress)
      onProgress({ stage: 'recording', ratio: Math.min(1, elapsed / totalSeconds) })
      if (elapsed >= totalSeconds) break
      await nextAnimationFrame()
    }
  } finally {
    if (recorder.state !== 'inactive') recorder.stop()
  }
  let captured: Blob
  try {
    captured = await recording
  } finally {
    stream.getTracks().forEach((track) => track.stop())
  }
  if (!captured.size) throw new Error('浏览器没有生成有效视频数据')

  const safeName = safeFileName(options.fileName, 'A9_VT_动态图')
  if (/mp4/i.test(captured.type)) {
    download(captured, `${safeName}.mp4`)
    return { format: 'mp4' as const, duration: totalSeconds }
  }

  try {
    onProgress({ stage: 'encoding', ratio: 0 })
    const mp4 = await transcodeRecordingToMp4(captured, (ratio) => onProgress({ stage: 'encoding', ratio }))
    download(mp4, `${safeName}.mp4`)
    return { format: 'mp4' as const, duration: totalSeconds }
  } catch (error) {
    download(captured, `${safeName}.webm`)
    return {
      format: 'webm' as const,
      duration: totalSeconds,
      warning: error instanceof Error ? error.message : 'MP4 转换失败',
    }
  }
}

function drawFrame(
  context: CanvasRenderingContext2D,
  series: ChartVideoSeries[],
  currentTime: number,
  minTime: number,
  maxTime: number,
  maxSpeed: number,
  timeLabel: string,
  progress: number,
) {
  const plotRight = WIDTH - PADDING.right
  const plotBottom = HEIGHT - PADDING.bottom
  const plotWidth = plotRight - PADDING.left
  const plotHeight = plotBottom - PADDING.top
  const x = (time: number) => PADDING.left + ((time - minTime) / Math.max(.001, maxTime - minTime)) * plotWidth
  const y = (speed: number) => plotBottom - speed / maxSpeed * plotHeight

  context.fillStyle = '#0b0d0e'
  context.fillRect(0, 0, WIDTH, HEIGHT)
  const glow = context.createRadialGradient(WIDTH * .62, 40, 0, WIDTH * .62, 40, 560)
  glow.addColorStop(0, 'rgba(183,243,75,.07)')
  glow.addColorStop(1, 'rgba(183,243,75,0)')
  context.fillStyle = glow
  context.fillRect(0, 0, WIDTH, HEIGHT)

  context.fillStyle = '#b7f34b'
  context.font = '700 14px ui-monospace, Consolas, "Microsoft YaHei", monospace'
  context.fillText('A9 / TELEMETRY', PADDING.left, 38)
  context.fillStyle = '#f2f5f6'
  context.font = '700 25px Inter, "Microsoft YaHei", sans-serif'
  context.fillText('速度–时间动态对比', PADDING.left, 76)
  context.fillStyle = '#737d80'
  context.font = '12px Inter, "Microsoft YaHei", sans-serif'
  context.fillText('曲线随时间显现 · 当前节点实时高亮', PADDING.left, 99)

  context.strokeStyle = '#30373a'
  context.lineWidth = 1
  context.fillStyle = '#8b9598'
  context.font = '11px ui-monospace, Consolas, monospace'
  for (let index = 0; index <= 5; index += 1) {
    const ratio = index / 5
    const gridY = PADDING.top + ratio * plotHeight
    context.beginPath()
    context.moveTo(PADDING.left, gridY)
    context.lineTo(plotRight, gridY)
    context.stroke()
    context.textAlign = 'right'
    context.fillText(String(Math.round(maxSpeed * (1 - ratio))), PADDING.left - 14, gridY + 4)
  }
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4
    const gridX = PADDING.left + ratio * plotWidth
    context.beginPath()
    context.moveTo(gridX, PADDING.top)
    context.lineTo(gridX, plotBottom)
    context.stroke()
    context.textAlign = 'center'
    context.fillText(`${(minTime + ratio * (maxTime - minTime)).toFixed(2)}s`, gridX, plotBottom + 30)
  }
  context.textAlign = 'left'
  context.fillStyle = '#eef2f3'
  context.font = '700 12px Inter, "Microsoft YaHei", sans-serif'
  context.fillText('速度（KM/H）', 18, PADDING.top - 22)
  context.textAlign = 'center'
  context.fillText(timeLabel, PADDING.left + plotWidth / 2, HEIGHT - 28)

  context.save()
  context.beginPath()
  context.rect(PADDING.left - 10, PADDING.top - 18, plotWidth + 20, plotHeight + 36)
  context.clip()
  const playheadX = x(currentTime)
  context.strokeStyle = 'rgba(238,242,243,.3)'
  context.setLineDash([5, 7])
  context.beginPath()
  context.moveTo(playheadX, PADDING.top)
  context.lineTo(playheadX, plotBottom)
  context.stroke()
  context.setLineDash([])

  const activeRows: { name: string; color: string; speed: number }[] = []
  for (const item of series) {
    const visible = visibleSeries(item.points, currentTime)
    if (!visible.length) continue
    context.strokeStyle = item.color
    context.lineWidth = 4
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.shadowColor = item.color
    context.shadowBlur = 8
    context.beginPath()
    visible.forEach((point, index) => {
      if (index) context.lineTo(x(point.time), y(point.speed))
      else context.moveTo(x(point.time), y(point.speed))
    })
    context.stroke()
    context.shadowBlur = 0

    const active = visible.at(-1)!
    context.fillStyle = item.color
    context.globalAlpha = .22
    context.beginPath()
    context.arc(x(active.time), y(active.speed), 16, 0, Math.PI * 2)
    context.fill()
    context.globalAlpha = 1
    context.strokeStyle = '#ffffff'
    context.lineWidth = 3
    context.beginPath()
    context.arc(x(active.time), y(active.speed), 7, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    activeRows.push({ name: item.name, color: item.color, speed: active.speed })
  }
  context.restore()

  const cardX = WIDTH - PADDING.right + 30
  const cardY = PADDING.top
  const cardWidth = PADDING.right - 56
  const cardHeight = Math.min(390, 96 + Math.max(1, activeRows.length) * 42)
  context.fillStyle = 'rgba(17,20,21,.96)'
  context.strokeStyle = '#3a4245'
  context.lineWidth = 1
  roundedRect(context, cardX, cardY, cardWidth, cardHeight, 10)
  context.fill()
  context.stroke()
  context.fillStyle = '#7c8689'
  context.font = '10px ui-monospace, Consolas, monospace'
  context.textAlign = 'left'
  context.fillText('CURRENT NODE', cardX + 18, cardY + 25)
  context.fillStyle = '#ffffff'
  context.font = '700 27px ui-monospace, Consolas, monospace'
  context.fillText(`${currentTime.toFixed(3)}s`, cardX + 18, cardY + 58)
  context.fillStyle = '#606a6d'
  context.fillRect(cardX + 18, cardY + 74, cardWidth - 36, 1)
  activeRows.slice(0, 7).forEach((row, index) => {
    const rowY = cardY + 104 + index * 42
    context.fillStyle = row.color
    context.beginPath()
    context.arc(cardX + 22, rowY - 4, 5, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#aab2b5'
    context.font = '11px Inter, "Microsoft YaHei", sans-serif'
    context.fillText(ellipsis(context, row.name, cardWidth - 112), cardX + 36, rowY)
    context.fillStyle = '#ffffff'
    context.font = '700 14px ui-monospace, Consolas, monospace'
    context.textAlign = 'right'
    context.fillText(`${row.speed.toFixed(1)}`, cardX + cardWidth - 39, rowY)
    context.fillStyle = '#6c7679'
    context.font = '9px ui-monospace, Consolas, monospace'
    context.fillText('km/h', cardX + cardWidth - 12, rowY)
    context.textAlign = 'left'
  })

  context.fillStyle = '#1d2224'
  context.fillRect(PADDING.left, HEIGHT - 10, WIDTH - PADDING.left * 2, 3)
  context.fillStyle = '#b7f34b'
  context.fillRect(PADDING.left, HEIGHT - 10, (WIDTH - PADDING.left * 2) * progress, 3)
}

function visibleSeries(points: ChartVideoPoint[], currentTime: number) {
  if (!points.length || currentTime < points[0].time) return []
  const visible = points.filter((point) => point.time <= currentTime)
  const next = points[visible.length]
  const previous = visible.at(-1)
  if (previous && next && next.time > previous.time) {
    const ratio = (currentTime - previous.time) / (next.time - previous.time)
    visible.push({ time: currentTime, speed: previous.speed + (next.speed - previous.speed) * ratio })
  }
  return visible
}

function selectRecorderMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  const selected = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate))
  if (!selected) throw new Error('当前浏览器没有可用的视频编码器')
  return selected
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function ellipsis(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (context.measureText(value).width <= maxWidth) return value
  let result = value
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1)
  return `${result}…`
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
