import { useEffect, useMemo, useRef, useState } from 'react'
import { Aperture, BarChart3, CircleHelp, Cpu, Database, GitBranch, ListChecks, RotateCcw, Settings2, Video } from 'lucide-react'
import { CapturePanel } from './components/CapturePanel'
import { DataPanel } from './components/DataPanel'
import { TelemetryChart } from './components/TelemetryChart'
import { VideoWorkspace, type VideoWorkspaceHandle } from './components/VideoWorkspace'
import { ComparisonPage } from './components/ComparisonPage'
import { GuidePage } from './components/GuidePage'
import { ReviewForm } from './components/ReviewForm'
import { SettingsPage } from './components/SettingsPage'
import { cancelDigitRecognition, captureFrameSignature, captureRegion, isRepeatedFrame, prepareRecognition, recognizeDigits, recognizeSpeedDigits } from './lib/capture'
import { exportCsv, exportXlsx } from './lib/export'
import { normalizeGameTime, parseGameTime } from './lib/time'
import { repairCapturedTimes, type RawTelemetryCapture } from './lib/timeRepair'
import { transcodeToBrowserMp4 } from './lib/videoCompat'
import { correctSpeedOutliers } from './lib/speedChecks'
import { DEFAULT_RECOGNITION_SETTINGS, loadRecognitionSettings, saveRecognitionSettings } from './lib/settings'
import type { CropRegion, OcrResult, RecognitionSettings, RegionKind, TelemetryPoint } from './types'

type Page = 'extract' | 'review' | 'settings' | 'compare' | 'guide'

const DEFAULT_REGIONS: Record<RegionKind, CropRegion> = {
  speed: { x: 0.8477, y: 0.0139, width: 0.1094, height: 0.125 },
  timer: { x: 0.818, y: 0.154, width: 0.142, height: 0.068 },
}

export default function App() {
  const workspaceRef = useRef<VideoWorkspaceHandle>(null)
  const previewTimerRef = useRef<number | null>(null)
  const stopRef = useRef(false)
  const regionsRef = useRef(DEFAULT_REGIONS)
  const sourceRef = useRef<string | null>(null)
  const inputFileRef = useRef<File | null>(null)
  const conversionAttemptRef = useRef(false)
  const [source, setSource] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [regions, setRegions] = useState(DEFAULT_REGIONS)
  const [activeRegion, setActiveRegion] = useState<RegionKind>('speed')
  const [points, setPoints] = useState<TelemetryPoint[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [speed, setSpeed] = useState('')
  const [gameTime, setGameTime] = useState('')
  const [frameInterval, setFrameInterval] = useState(30)
  const [frameRate, setFrameRate] = useState(0)
  const [duration, setDuration] = useState(0)
  const [scope, setScope] = useState<'full' | 'range'>('full')
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(0)
  const [previewSpeed, setPreviewSpeed] = useState('')
  const [previewTimer, setPreviewTimer] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanRunning, setScanRunning] = useState(false)
  const [videoUsable, setVideoUsable] = useState(false)
  const [progress, setProgress] = useState('')
  const [videoProcessing, setVideoProcessing] = useState('')
  const [exportName, setExportName] = useState('A9_速度分析')
  const [settings, setSettings] = useState<RecognitionSettings>(() => loadRecognitionSettings())
  const [page, setPage] = useState<Page>(() => pageFromHash())
  const selected = useMemo(() => points.find((point) => point.id === selectedId) ?? null, [points, selectedId])

  useEffect(() => () => { if (sourceRef.current) URL.revokeObjectURL(sourceRef.current) }, [])
  useEffect(() => {
    const syncPage = () => setPage(pageFromHash())
    window.addEventListener('hashchange', syncPage)
    return () => window.removeEventListener('hashchange', syncPage)
  }, [])

  const navigate = (next: Page) => {
    window.location.hash = next === 'extract' ? '' : next
    setPage(next)
  }

  const updateSettings = (next: RecognitionSettings) => {
    setSettings(next)
    saveRecognitionSettings(next)
  }

  const loadFile = (file: File) => {
    const nextSource = URL.createObjectURL(file)
    const previousSource = sourceRef.current
    sourceRef.current = nextSource
    inputFileRef.current = file
    conversionAttemptRef.current = false
    setSource(nextSource)
    setFileName(file.name)
    setExportName(file.name.replace(/\.[^.]+$/, '') || 'A9_速度分析')
    setPoints([])
    setSelectedId(null)
    setFrameRate(0)
    setVideoUsable(false)
    setVideoProcessing('')
    setRangeStart(0)
    setProgress('视频已载入：先用右侧放大预览校准两个识别框')
    if (previousSource) URL.revokeObjectURL(previousSource)
  }

  const refreshPreviews = () => {
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current)
    previewTimerRef.current = window.setTimeout(() => {
      const video = workspaceRef.current?.video
      if (!video || video.readyState < 2) return
      try {
        setPreviewSpeed(captureRegion(video, regionsRef.current.speed).toDataURL('image/jpeg', .82))
        setPreviewTimer(captureRegion(video, regionsRef.current.timer).toDataURL('image/jpeg', .82))
      } catch { /* 下一次有效帧会重试 */ }
    }, 90)
  }

  useEffect(() => {
    regionsRef.current = regions
    if (source) refreshPreviews()
  }, [regions, source])

  const updateRegion = (kind: RegionKind, region: CropRegion) => {
    setRegions((current) => ({ ...current, [kind]: region }))
    window.setTimeout(refreshPreviews, 0)
  }

  const selectPoint = (id: string) => {
    const point = points.find((item) => item.id === id)
    if (!point) return
    setSelectedId(id)
    setSpeed(String(point.speed))
    setGameTime(point.gameTime)
    const video = workspaceRef.current?.video
    if (video) video.currentTime = point.videoTime
  }

  const savePoint = () => {
    const timeSeconds = parseGameTime(gameTime)
    const speedNumber = Number(speed)
    if (timeSeconds == null || !Number.isFinite(speedNumber) || speedNumber < 0 || speedNumber > settings.maxSpeed) {
      setProgress('请输入有效速度和局内时间，例如 245 与 01:23.450')
      return
    }
    const existing = selectedId
    const next: TelemetryPoint = {
      id: existing ?? crypto.randomUUID(), gameTime: normalizeGameTime(timeSeconds), timeSeconds, speed: speedNumber,
      videoTime: workspaceRef.current?.video?.currentTime ?? 0, source: '手动', locked: true,
    }
    setPoints((current) => enforceMonotonic(existing ? current.map((item) => item.id === existing ? next : item) : [...current, next]))
    setSelectedId(null)
    setSpeed('')
    setGameTime('')
    setProgress(existing ? '记录已修正，并重新检查了时间连续性' : '已添加一条数据')
  }

  const recognizeRawFrame = async (speedThorough = true, timerThorough = true) => {
    const video = workspaceRef.current?.video
    if (!video || video.readyState < 2) return null
    let speedResult: OcrResult
    try {
      speedResult = settings.model === 'a9-cn'
        ? await recognizeSpeedDigits(video, regions.speed)
        : await recognizeDigits(captureRegion(video, regions.speed), 'speed', speedThorough)
    } catch {
      speedResult = await recognizeDigits(captureRegion(video, regions.speed), 'speed', speedThorough)
    }
    if (settings.model === 'a9-cn' && (!speedResult.value || speedResult.confidence < 55)) {
      const fallback = await recognizeDigits(captureRegion(video, regions.speed), 'speed', speedThorough)
      if (!speedResult.value || (fallback.value && fallback.confidence > speedResult.confidence)) speedResult = fallback
    }
    if (stopRef.current) throw new DOMException('分析已停止', 'AbortError')
    const timerResult = await recognizeDigits(captureRegion(video, regions.timer), 'timer', timerThorough)
    return { videoTime: video.currentTime, speedResult, timerResult }
  }

  const ocrCurrent = async () => {
    setBusy(true)
    const mobileMode = isMobileBrowser()
    setProgress(`正在准备${settings.model === 'a9-cn' ? ' A9 国服速度模型' : '默认数字 OCR'}…`)
    try {
      await withTimeout(prepareRecognition(settings.model), 45000, 'OCR 初始化超时，请刷新页面或检查存储空间')
      setProgress('模型已就绪，正在识别当前帧…')
      const result = await recognizeRawFrame(!mobileMode, !mobileMode)
      if (!result) return
      const speedValue = result.speedResult.value ?? ''
      const timerValue = result.timerResult.value ?? ''
      setSpeed(speedValue)
      setGameTime(timerValue)
      if (!speedValue || parseGameTime(timerValue) == null) {
        setProgress(`识别不完整：速度“${result.speedResult.raw || '—'}”，时间“${result.timerResult.raw || '—'}”。请检查放大预览。`)
      } else {
        const confidence = (result.speedResult.confidence + result.timerResult.confidence) / 2
        const engine = result.speedResult.engine === 'speed-model' ? '速度模型 + 计时 OCR' : 'OCR 回退'
        setProgress(`识别完成 · ${engine} · 平均置信度 ${Math.round(confidence)}%，结果已送入“复查编辑”页，人工保存后会永久锁定。`)
      }
    } catch (error) { setProgress(`OCR 失败：${error instanceof Error ? error.message : '未知错误'}`) }
    finally { setBusy(false) }
  }

  const autoLocate = async () => {
    const video = workspaceRef.current?.video
    if (!video) return
    setBusy(true)
    video.pause()
    setProgress('正在搜索右上区域中的速度和计时数字…')
    try {
      const speedCandidates = makeCandidates('speed', regions.speed)
      const timerCandidates = makeCandidates('timer', regions.timer)
      const speedRegion = await bestRegion(video, speedCandidates, 'speed', (index, total) => setProgress(`速度区域颜色筛选完成 · OCR 精查 ${index + 1} / ${total}`))
      const timerRegion = await bestRegion(video, timerCandidates, 'timer', (index, total) => setProgress(`计时区域颜色筛选完成 · OCR 精查 ${index + 1} / ${total}`))
      setRegions({ speed: speedRegion ?? regions.speed, timer: timerRegion ?? regions.timer })
      window.setTimeout(refreshPreviews, 100)
      setProgress(speedRegion && timerRegion ? '自动定位完成，请在放大预览中确认后再识别' : '仅定位到部分区域，请手动微调未命中的框')
    } catch (error) { setProgress(`自动定位失败：${error instanceof Error ? error.message : '未知错误'}`) }
    finally { setBusy(false) }
  }

  const autoScan = async () => {
    const video = workspaceRef.current?.video
    if (!video) return
    if (scanRunning) {
      stopRef.current = true
      video.pause()
      setProgress('已收到停止请求，正在终止当前 OCR…')
      void cancelDigitRecognition()
      return
    }
    if (busy || !videoUsable) return
    setBusy(true)
    setScanRunning(true)
    stopRef.current = false
    video.pause()
    const originalTime = video.currentTime
    const start = scope === 'full' ? 0 : Math.max(0, Math.min(rangeStart, video.duration))
    const end = Math.max(start, Math.min(scope === 'full' ? video.duration - .001 : rangeEnd, video.duration - .001))
      const captured: RawTelemetryCapture[] = []
    let previousSignature: Uint8Array | null = null
    let repeatedFrames = 0
    let activeFps = frameRate || 60
    const mobileMode = isMobileBrowser()
    try {
      setProgress(`正在本地载入 OCR 资源与${settings.model === 'a9-cn' ? ' A9 国服模型' : '默认模型'}…`)
      await withTimeout(prepareRecognition(settings.model), 45000, 'OCR 初始化超时；请关闭其他占用内存的页面后重试')
      if (stopRef.current) return
      const fps = frameRate || await detectFrameRate(video)
      activeFps = fps
      setFrameRate(fps)
      const frameStep = Number.isFinite(frameInterval) ? Math.max(1, Math.round(frameInterval)) : 1
      const startFrame = Math.ceil(start * fps)
      const endFrame = Math.floor(end * fps)
      const total = Math.floor((endFrame - startFrame) / frameStep) + 1
      for (let sample = 0, frame = startFrame; frame <= endFrame; frame += frameStep, sample += 1) {
        if (stopRef.current) break
        const target = Math.min(end, frame / fps)
        await seekVideo(video, target, () => stopRef.current)
        if (stopRef.current) break
        const signature = captureFrameSignature(video)
        if (isRepeatedFrame(previousSignature, signature)) {
          repeatedFrames += 1
          previousSignature = signature
          setProgress(`分析 ${sample + 1} / ${total} · 第 ${frame} 帧 · 检测到卡顿重复画面，已跳过`)
          await yieldToBrowser()
          continue
        }
        previousSignature = signature
        setProgress(`分析 ${sample + 1} / ${total} · 第 ${frame} 帧 · ${target.toFixed(3)}s${mobileMode ? ' · 速度轻量 / 计时高精度' : ''}`)
        await yieldToBrowser()
        const result = await withTimeout(recognizeRawFrame(!mobileMode, !mobileMode), mobileMode ? 20000 : 30000, `第 ${frame} 帧 OCR 超时`)
        if (stopRef.current) break
        if (!result?.speedResult.value) continue
        const rawTime = result.timerResult.value ?? ''
        const parsedTime = parseGameTime(rawTime)
        captured.push({
          speed: Number(result.speedResult.value), videoTime: target,
          source: result.speedResult.engine === 'speed-model' ? '模型+OCR' : 'OCR',
          confidence: (result.speedResult.confidence + result.timerResult.confidence) / 2,
          timerConfidence: result.timerResult.confidence,
          rawGameTime: rawTime,
          parsedTime,
        })
      }
      const repaired = repairCapturedTimes(captured, points, activeFps)
      const speedCorrection = correctSpeedOutliers(enforceMonotonic(dedupe([...points, ...repaired.points])), settings)
      setPoints(speedCorrection.points)
      const stopped = stopRef.current ? '已停止' : '完成'
      setProgress(`${stopped}：提取 ${repaired.points.length} 条；跳过 ${repeatedFrames} 个卡顿重复帧，修正 ${repaired.correctedCount} 条异常时间、${speedCorrection.count} 条突变速度。`)
    } catch (error) {
      if (stopRef.current) {
        const repaired = repairCapturedTimes(captured, points, activeFps)
        const speedCorrection = correctSpeedOutliers(enforceMonotonic(dedupe([...points, ...repaired.points])), settings)
        setPoints(speedCorrection.points)
        setProgress(`已停止分析，保留已提取的 ${repaired.points.length} 条记录。`)
      } else {
        setProgress(`分析中止：${error instanceof Error ? error.message : '未知错误'}`)
      }
    } finally {
      video.currentTime = originalTime
      setBusy(false)
      setScanRunning(false)
      stopRef.current = false
    }
  }

  const useCurrentEdge = (edge: 'start' | 'end') => {
    const value = Number((workspaceRef.current?.video?.currentTime ?? 0).toFixed(3))
    if (edge === 'start') setRangeStart(value)
    else setRangeEnd(value)
  }
  const handleVideoMetadata = (value: number) => {
    setDuration(value)
    setRangeEnd(Number(value.toFixed(3)))
    window.setTimeout(refreshPreviews, 100)
    window.setTimeout(() => {
      const video = workspaceRef.current?.video
      if (video) void detectFrameRate(video).then((fps) => { setFrameRate(fps); setProgress(`已检测到 ${fps.toFixed(2)} FPS，可使用方向键逐帧检查`) })
    }, 180)
  }
  const handleVideoPlayable = () => {
    setVideoUsable((wasUsable) => {
      if (!wasUsable) {
        setVideoProcessing('')
        setProgress('视频已成功解码，正在后台准备本地 OCR…')
        void prepareRecognition(settings.model)
          .then(() => setProgress(`OCR 已就绪 · ${settings.model === 'a9-cn' ? 'A9 国服速度模型' : '默认数字 OCR'} · 可以开始分析`))
          .catch((error) => setProgress(`OCR 资源准备失败：${error instanceof Error ? error.message : '未知错误'}`))
      }
      return true
    })
  }
  const handleVideoError = async (message: string) => {
    setVideoUsable(false)
    const file = inputFileRef.current
    if (!file || conversionAttemptRef.current || !/\.mp4$/i.test(file.name)) {
      setProgress(message)
      return
    }
    conversionAttemptRef.current = true
    setBusy(true)
    setVideoProcessing('检测到浏览器不支持该 MP4 编码，正在自动转换为 H.264…')
    setProgress('原始 MP4 无法由浏览器解码，正在本机自动转换；视频越长，所需时间越久。')
    try {
      const converted = await transcodeToBrowserMp4(file, (ratio) => {
        const percent = Math.max(1, Math.min(99, Math.round(ratio * 100)))
        setVideoProcessing(`正在转换为浏览器兼容视频 · ${percent}%`)
        setProgress(`MP4 兼容转换 ${percent}% · 全程仅在本机浏览器中处理`)
      })
      const nextSource = URL.createObjectURL(converted)
      const previousSource = sourceRef.current
      sourceRef.current = nextSource
      setSource(nextSource)
      setVideoProcessing('转换完成，正在载入视频…')
      setProgress('兼容转换完成，正在载入 H.264 视频')
      if (previousSource) URL.revokeObjectURL(previousSource)
    } catch (error) {
      setVideoProcessing('')
      setProgress(`MP4 自动转换失败：${error instanceof Error ? error.message : '未知错误'}。建议转换为 H.264/YUV420P MP4 后重试。`)
    } finally {
      setBusy(false)
    }
  }
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'A9_速度分析'
  const workspace = <VideoWorkspace ref={workspaceRef} source={source} fileName={fileName} regions={regions} activeRegion={activeRegion} onActiveRegion={setActiveRegion} onRegionChange={updateRegion} onFile={loadFile} onVideoMetadata={handleVideoMetadata} onVideoPlayable={handleVideoPlayable} onVideoError={handleVideoError} onFrameChange={refreshPreviews} frameRate={frameRate} processingMessage={videoProcessing} />
  const dataPanel = <DataPanel points={points} selectedId={selectedId} onSelect={selectPoint} onDelete={(id) => { setPoints((current) => current.filter((item) => item.id !== id)); if (selectedId === id) setSelectedId(null) }} onClear={() => { setPoints([]); setSelectedId(null) }} exportName={exportName} onExportName={setExportName} onExportCsv={() => void exportCsv(points, exportName || baseName)} onExportXlsx={() => void exportXlsx(points, exportName || baseName)} />

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span><Aperture size={18} /></span><div><strong>A9 / TELEMETRY</strong><small>VIDEO PERFORMANCE LAB</small></div></div>
        <div className="session-title"><i /><span>{pageTitle(page)}</span><strong>{page === 'extract' || page === 'review' ? fileName || '未命名项目' : page.toUpperCase()}</strong></div>
        <nav>
          <button title="速度提取" className={page === 'extract' ? 'active' : ''} disabled={busy} onClick={() => navigate('extract')}><Video size={16} />速度提取</button>
          <button title="复查编辑" className={page === 'review' ? 'active' : ''} disabled={busy} onClick={() => navigate('review')}><ListChecks size={16} />复查编辑</button>
          <button title="识别设置" className={page === 'settings' ? 'active' : ''} disabled={busy} onClick={() => navigate('settings')}><Settings2 size={16} />识别设置</button>
          <button title="数据对比" className={page === 'compare' ? 'active' : ''} disabled={busy} onClick={() => navigate('compare')}><BarChart3 size={16} />数据对比</button>
          <button title="使用指南" className={page === 'guide' ? 'active' : ''} disabled={busy} onClick={() => navigate('guide')}><CircleHelp size={16} />使用指南</button>
          <span className="version">BUILD 1.6.0</span>
        </nav>
      </header>
      {page === 'extract' ? <main className="extract-main">
        <div className="workspace-column">
          {workspace}
          <TelemetryChart points={points} />
        </div>
        <div className="control-column">
          <CapturePanel frameInterval={frameInterval} frameRate={frameRate} scope={scope} rangeStart={rangeStart} rangeEnd={rangeEnd} duration={duration} previewSpeed={previewSpeed} previewTimer={previewTimer} busy={busy} scanRunning={scanRunning} progress={progress} disabled={!videoUsable} onFrameInterval={setFrameInterval} onScope={setScope} onRangeStart={setRangeStart} onRangeEnd={setRangeEnd} onUseCurrent={useCurrentEdge} onOcrCurrent={ocrCurrent} onAutoLocate={autoLocate} onAutoScan={autoScan} />
          <section className="panel extraction-summary"><span className="eyebrow">NEXT STEP</span><strong>{points.length} 条数据等待复查</strong><p>完成提取后前往“复查编辑”。点击记录会自动跳到对应视频帧，人工保存的数据将永久锁定。</p><button disabled={!points.length} onClick={() => navigate('review')}>进入复查编辑</button></section>
        </div>
      </main> : page === 'review' ? <main className="review-main">
        <div className="workspace-column">{workspace}<TelemetryChart points={points} /></div>
        <div className="control-column"><ReviewForm speed={speed} gameTime={gameTime} selected={selected} disabled={!videoUsable} onSpeed={setSpeed} onGameTime={setGameTime} onSave={savePoint} onCancel={() => { setSelectedId(null); setSpeed(''); setGameTime('') }} />{dataPanel}</div>
      </main> : page === 'settings' ? <SettingsPage settings={settings} onChange={updateSettings} onReset={() => updateSettings(DEFAULT_RECOGNITION_SETTINGS)} /> : page === 'compare' ? <ComparisonPage /> : <GuidePage />}
      <footer><span><i />系统就绪</span><span><Cpu size={13} />浏览器本地计算</span><span><Database size={13} />数据不会上传服务器</span>{(page === 'extract' || page === 'review') && <button onClick={() => setRegions(DEFAULT_REGIONS)}><RotateCcw size={13} />重置框选</button>}<a href="https://github.com/REALXD233/a9-telemetry-lab" target="_blank" rel="noreferrer"><GitBranch size={13} />项目源码</a></footer>
    </div>
  )
}

function pageFromHash(): Page {
  if (window.location.hash === '#review') return 'review'
  if (window.location.hash === '#settings') return 'settings'
  if (window.location.hash === '#compare') return 'compare'
  if (window.location.hash === '#guide') return 'guide'
  return 'extract'
}

function pageTitle(page: Page) {
  if (page === 'extract') return '速度提取'
  if (page === 'review') return '复查编辑'
  if (page === 'settings') return '识别与质量检查'
  if (page === 'compare') return '多组数据对比'
  return '操作教学文档'
}

async function detectFrameRate(video: HTMLVideoElement) {
  const fallback = 60
  if (typeof video.requestVideoFrameCallback !== 'function') return fallback
  const originalTime = video.currentTime
  const wasPaused = video.paused
  const times: number[] = []
  video.muted = true
  return new Promise<number>((resolve) => {
    let settled = false
    let callbackId: number | null = null
    let timeout = 0
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (callbackId != null && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(callbackId)
      video.pause()
      video.currentTime = originalTime
      const diffs = times.slice(1).map((time, index) => time - times[index]).filter((diff) => diff > .001)
      diffs.sort((a, b) => a - b)
      const median = diffs[Math.floor(diffs.length / 2)]
      if (!wasPaused) void video.play()
      resolve(median ? Math.min(240, Math.max(1, 1 / median)) : fallback)
    }
    const sample = (_now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
      if (settled) return
      times.push(metadata.mediaTime)
      if (times.length >= 12 || video.ended) finish()
      else callbackId = video.requestVideoFrameCallback(sample)
    }
    callbackId = video.requestVideoFrameCallback(sample)
    timeout = window.setTimeout(finish, 2200)
    void video.play().catch(finish)
  })
}

async function seekVideo(video: HTMLVideoElement, time: number, cancelled: () => boolean = () => false) {
  const target = Math.max(0, Math.min(time, Math.max(0, video.duration - .001)))
  if (Math.abs(video.currentTime - target) >= .0005) await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', check)
      video.removeEventListener('timeupdate', check)
      video.removeEventListener('loadeddata', check)
      window.clearInterval(cancelTimer)
      window.clearTimeout(timeout)
    }
    const done = () => { cleanup(); resolve() }
    const check = () => {
      if (cancelled()) return done()
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && Math.abs(video.currentTime - target) <= .025) done()
    }
    const cancelTimer = window.setInterval(() => {
      check()
    }, 50)
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('视频跳帧超时；请确认视频可以正常播放'))
    }, 8000)
    video.addEventListener('seeked', check)
    video.addEventListener('timeupdate', check)
    video.addEventListener('loadeddata', check)
    try {
      video.currentTime = target
      check()
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
  if (!cancelled()) await waitForDecodedFrame(video)
}

function waitForDecodedFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    let settled = false
    let callbackId: number | null = null
    const done = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (callbackId != null && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(callbackId)
      resolve()
    }
    const timeout = window.setTimeout(done, 700)
    if (typeof video.requestVideoFrameCallback === 'function') {
      callbackId = video.requestVideoFrameCallback(() => done())
    } else {
      requestAnimationFrame(() => requestAnimationFrame(done))
    }
  })
}

function enforceMonotonic(points: TelemetryPoint[]) {
  const sorted = points.map((point) => ({ ...point })).sort((a, b) => a.videoTime - b.videoTime)
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]
    if (current.timeSeconds <= previous.timeSeconds) {
      if (isLockedPoint(current)) {
        let leftIndex = index - 1
        while (leftIndex >= 0 && !isLockedPoint(sorted[leftIndex])) leftIndex -= 1
        const leftAnchor = leftIndex >= 0 ? sorted[leftIndex] : null
        if (!leftAnchor || current.timeSeconds > leftAnchor.timeSeconds) {
          for (let repairIndex = leftIndex + 1; repairIndex < index; repairIndex += 1) {
            const point = sorted[repairIndex]
            const expected = leftAnchor && current.videoTime > leftAnchor.videoTime
              ? leftAnchor.timeSeconds + (current.timeSeconds - leftAnchor.timeSeconds) * ((point.videoTime - leftAnchor.videoTime) / (current.videoTime - leftAnchor.videoTime))
              : current.timeSeconds - (current.videoTime - point.videoTime)
            point.rawGameTime ??= point.gameTime
            point.timeSeconds = expected
            point.gameTime = normalizeGameTime(expected)
            point.corrected = true
          }
        }
        continue
      }
      current.rawGameTime ??= current.gameTime
      current.timeSeconds = previous.timeSeconds + Math.max(.001, current.videoTime - previous.videoTime)
      current.gameTime = normalizeGameTime(current.timeSeconds)
      current.corrected = true
    }
  }
  return sorted
}

function dedupe(points: TelemetryPoint[]) {
  const seen = new Map<string, TelemetryPoint>()
  points.forEach((point) => {
    const key = point.videoTime.toFixed(4)
    const existing = seen.get(key)
    if (!existing || isLockedPoint(point) || !isLockedPoint(existing)) seen.set(key, point)
  })
  return [...seen.values()]
}

function isLockedPoint(point: TelemetryPoint) {
  return point.locked === true || point.source === '手动'
}

function isMobileBrowser() {
  const navigatorWithHints = navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  if (navigatorWithHints.userAgentData?.mobile != null) return navigatorWithHints.userAgentData.mobile
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, isMobileBrowser() ? 16 : 0))
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string) {
  let timer = 0
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), milliseconds) }),
    ])
  } finally {
    window.clearTimeout(timer)
  }
}

function makeCandidates(kind: RegionKind, current: CropRegion): CropRegion[] {
  const candidates: CropRegion[] = [current]
  if (kind === 'speed') {
    for (let x = .72; x <= .89; x += .02) for (let y = 0; y <= .14; y += .02) {
      for (const width of [.1, .115, .13]) for (const height of [.105, .125, .145]) {
        if (x + width <= .995 && y + height <= .3) candidates.push({ x, y, width, height })
      }
    }
  } else {
    for (let x = .48; x <= .86; x += .03) for (let y = 0; y <= .16; y += .02) {
      for (const width of [.14, .17, .2]) for (const height of [.065, .08, .105]) {
        if (x + width <= .995 && y + height <= .32) candidates.push({ x, y, width, height })
      }
    }
  }
  return candidates
}

async function bestRegion(video: HTMLVideoElement, candidates: CropRegion[], kind: RegionKind, onProgress: (index: number, total: number) => void) {
  let best: { region: CropRegion; score: number } | null = null
  const scored = candidates.map((region) => ({ region, visual: regionVisualScore(video, region, kind) }))
  const current = scored[0]
  const ranked = [current, ...scored.slice(1).sort((a, b) => b.visual - a.visual)]
    .filter((candidate, index, all) => all.findIndex((item) => regionKey(item.region) === regionKey(candidate.region)) === index)
    .slice(0, kind === 'speed' ? 11 : 13)
  for (let index = 0; index < ranked.length; index += 1) {
    onProgress(index, ranked.length)
    const candidate = ranked[index]
    const result = await recognizeDigits(captureRegion(video, candidate.region), kind, false)
    const score = result.confidence * .68 + candidate.visual * .32
    if (result.value && (!best || score > best.score)) best = { region: candidate.region, score }
  }
  return best?.region ?? null
}

function regionKey(region: CropRegion) {
  return `${region.x.toFixed(4)}:${region.y.toFixed(4)}:${region.width.toFixed(4)}:${region.height.toFixed(4)}`
}

function regionVisualScore(video: HTMLVideoElement, region: CropRegion, kind: RegionKind) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 36
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return 0
  context.drawImage(video, region.x * video.videoWidth, region.y * video.videoHeight, region.width * video.videoWidth, region.height * video.videoHeight, 0, 0, canvas.width, canvas.height)
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data
  let dark = 0
  let bright = 0
  let red = 0
  let luminanceSum = 0
  let luminanceSquared = 0
  const count = canvas.width * canvas.height
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const luminance = .299 * r + .587 * g + .114 * b
    luminanceSum += luminance
    luminanceSquared += luminance * luminance
    if (luminance < 62) dark += 1
    if (luminance > 178) bright += 1
    if (r > 78 && r > g * 1.3 && r > b * 1.2) red += 1
  }
  const darkRatio = dark / count
  const brightRatio = bright / count
  const redRatio = red / count
  const mean = luminanceSum / count
  const contrast = Math.min(1, Math.sqrt(Math.max(0, luminanceSquared / count - mean * mean)) / 75)
  if (kind === 'speed') {
    const digitBalance = 1 - Math.min(1, Math.abs(brightRatio - .22) / .3)
    return Math.max(0, Math.min(100, darkRatio * 52 + digitBalance * 25 + contrast * 28 - redRatio * 22))
  }
  const redBalance = Math.min(1, redRatio / .34)
  const digitBalance = 1 - Math.min(1, Math.abs(brightRatio - .17) / .28)
  return Math.max(0, Math.min(100, redBalance * 58 + digitBalance * 18 + contrast * 24))
}
