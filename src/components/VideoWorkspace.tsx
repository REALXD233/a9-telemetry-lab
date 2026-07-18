import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Crop, Gauge, Pause, Play, ScanLine, SkipBack, SkipForward, TimerReset, Upload } from 'lucide-react'
import type { CropRegion, RegionKind } from '../types'
import { formatVideoTime } from '../lib/time'
import { IconButton } from './IconButton'
import { RegionOverlay } from './RegionOverlay'

export interface VideoWorkspaceHandle {
  video: HTMLVideoElement | null
}

interface Props {
  source: string | null
  fileName: string
  regions: Record<RegionKind, CropRegion>
  activeRegion: RegionKind
  onActiveRegion: (kind: RegionKind) => void
  onRegionChange: (kind: RegionKind, region: CropRegion) => void
  onFile: (file: File) => void
  onVideoMetadata: (duration: number) => void
  onVideoPlayable: () => void
  onVideoError: (message: string) => void
  onFrameChange: () => void
  frameRate: number
  processingMessage?: string
}

export const VideoWorkspace = forwardRef<VideoWorkspaceHandle, Props>(function VideoWorkspace(
  { source, fileName, regions, activeRegion, onActiveRegion, onRegionChange, onFile, onVideoMetadata, onVideoPlayable, onVideoError, onFrameChange, frameRate, processingMessage }, ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [aspectRatio, setAspectRatio] = useState(16 / 9)
  const [dragging, setDragging] = useState(false)
  const [ready, setReady] = useState(false)
  const [decodeError, setDecodeError] = useState('')
  useImperativeHandle(ref, () => ({ video: videoRef.current }))

  useEffect(() => {
    setReady(false)
    setDecodeError('')
    setCurrentTime(0)
    setDuration(0)
  }, [source])

  const toggle = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }

  const seek = (delta: number) => {
    if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + delta))
  }

  const stepFrame = (direction: -1 | 1) => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    const fps = frameRate || 60
    const frame = Math.round(video.currentTime * fps) + direction
    video.currentTime = Math.max(0, Math.min(duration, frame / fps))
  }

  const receive = (file?: File) => {
    if (file && (file.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|mkv)$/i.test(file.name))) onFile(file)
  }

  return (
    <section ref={panelRef} className="panel video-panel" tabIndex={0} onKeyDown={(event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); stepFrame(-1) }
      if (event.key === 'ArrowRight') { event.preventDefault(); stepFrame(1) }
    }}>
      <header className="panel-header video-header">
        <div><span className="eyebrow">SOURCE / 01</span><strong>{fileName || '等待载入视频'}</strong></div>
        <div className="video-header-actions">{source && <button className="replace-video" onClick={() => inputRef.current?.click()}><Upload size={13} />更换视频</button>}<div className="video-status"><i className={ready ? 'online' : ''} />{decodeError ? '解码失败' : ready ? '视频可播放' : source ? '正在读取' : '未连接'}</div></div>
      </header>
      <div
        className={`video-stage ${dragging ? 'is-dragging' : ''}`}
        onPointerDown={() => panelRef.current?.focus()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); receive(event.dataTransfer.files[0]) }}
      >
        {!source ? (
          <button className="drop-zone" onClick={() => inputRef.current?.click()}>
            <span className="upload-glyph"><Upload size={28} /></span>
            <strong>载入比赛录像</strong>
            <span>拖放“狂野飙车 9”视频，或从本机选择文件</span>
            <em>支持 H.264 MP4 / WebM · 视频仅在本机浏览器中处理</em>
          </button>
        ) : (
          <div className="video-viewport" style={{ aspectRatio }}>
            <video
              key={source}
              ref={videoRef}
              src={source}
              onLoadedMetadata={(event) => {
                setDuration(event.currentTarget.duration)
                if (event.currentTarget.videoWidth > 0 && event.currentTarget.videoHeight > 0) {
                  setAspectRatio(event.currentTarget.videoWidth / event.currentTarget.videoHeight)
                }
                onVideoMetadata(event.currentTarget.duration)
              }}
              onCanPlay={(event) => {
                if (!event.currentTarget.videoWidth || !event.currentTarget.videoHeight) return
                setReady(true)
                setDecodeError('')
                onVideoPlayable()
                onFrameChange()
              }}
              onError={(event) => {
                const code = event.currentTarget.error?.code
                const message = code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
                  ? '浏览器不支持此视频的编码。请使用 H.264/AAC MP4 或 WebM。'
                  : '视频读取失败，请检查文件是否完整或更换浏览器兼容格式。'
                setReady(false)
                setDecodeError(message)
                onVideoError(message)
              }}
              onSeeked={onFrameChange}
              onTimeUpdate={(event) => { setCurrentTime(event.currentTarget.currentTime); onFrameChange() }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              playsInline
              preload="auto"
            />
            {processingMessage
              ? <div className="video-decode-error is-processing"><strong>正在准备视频</strong><span>{processingMessage}</span><small>请保持此页面开启；转换只使用本机资源。</small></div>
              : decodeError && <div className="video-decode-error"><strong>无法预览视频</strong><span>{decodeError}</span><small>已阻止分析，避免任务卡在不可解码的视频上。</small></div>}
            <RegionOverlay kind="speed" region={regions.speed} active={activeRegion === 'speed'} onActivate={() => onActiveRegion('speed')} onChange={(next) => onRegionChange('speed', next)} />
            <RegionOverlay kind="timer" region={regions.timer} active={activeRegion === 'timer'} onActivate={() => onActiveRegion('timer')} onChange={(next) => onRegionChange('timer', next)} />
          </div>
        )}
        <input ref={inputRef} hidden type="file" accept="video/*,.mp4,.m4v,.mov,.webm,.mkv" onChange={(event) => { receive(event.target.files?.[0]); event.currentTarget.value = '' }} />
      </div>
      <div className="transport">
        <div className="region-tabs">
          <button className={activeRegion === 'speed' ? 'active' : ''} onClick={() => onActiveRegion('speed')}><Gauge size={15} />速度 ROI</button>
          <button className={activeRegion === 'timer' ? 'active timer' : ''} onClick={() => onActiveRegion('timer')}><TimerReset size={15} />计时 ROI</button>
        </div>
        <div className="scrubber">
          <span>{formatVideoTime(currentTime)}</span>
          <input aria-label="视频进度" type="range" min="0" max={duration || 0} step="0.01" value={currentTime} disabled={!source} onChange={(event) => { if (videoRef.current) videoRef.current.currentTime = Number(event.target.value) }} />
          <span>{formatVideoTime(duration)}</span>
        </div>
        <div className="transport-buttons">
          <IconButton label="后退一秒" disabled={!source} onClick={() => seek(-1)}><SkipBack size={15} /></IconButton>
          <IconButton label="上一帧（左方向键）" className="frame-button" disabled={!source} onClick={() => stepFrame(-1)}><ChevronLeft size={18} /></IconButton>
          <IconButton label={playing ? '暂停' : '播放'} className="play-button" disabled={!source} onClick={toggle}>{playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</IconButton>
          <IconButton label="下一帧（右方向键）" className="frame-button" disabled={!source} onClick={() => stepFrame(1)}><ChevronRight size={18} /></IconButton>
          <IconButton label="前进一秒" disabled={!source} onClick={() => seek(1)}><SkipForward size={15} /></IconButton>
        </div>
      </div>
      <div className="stage-footnote"><ScanLine size={14} />拖动框体定位，右下角调整大小 <span className="frame-readout">FRAME {String(Math.round(currentTime * (frameRate || 60))).padStart(6, '0')} / {String(Math.round(duration * (frameRate || 60))).padStart(6, '0')} · {(frameRate || 60).toFixed(2)} FPS</span><Crop size={14} />左右方向键逐帧检查</div>
    </section>
  )
})
