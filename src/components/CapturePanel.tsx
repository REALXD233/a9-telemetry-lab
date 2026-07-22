import { Bot, Camera, Check, Crosshair, LoaderCircle, Sparkles, WandSparkles } from 'lucide-react'

interface Props {
  frameInterval: number
  frameRate: number
  scope: 'full' | 'range'
  rangeStart: number
  rangeEnd: number
  duration: number
  previewSpeed: string
  previewTimer: string
  busy: boolean
  scanRunning: boolean
  progress: string
  disabled: boolean
  currentSpeed: string
  currentGameTime: string
  currentResult: { videoTime: number; confidence: number; engine: string } | null
  onFrameInterval: (value: number) => void
  onScope: (value: 'full' | 'range') => void
  onRangeStart: (value: number) => void
  onRangeEnd: (value: number) => void
  onUseCurrent: (edge: 'start' | 'end') => void
  onOcrCurrent: () => void
  onCurrentSpeed: (value: string) => void
  onCurrentGameTime: (value: string) => void
  onAddCurrent: () => void
  onAutoLocate: () => void
  onAutoScan: () => void
}

export function CapturePanel(props: Props) {
  return (
    <section className="panel capture-panel">
      <header className="panel-header">
        <div><span className="eyebrow">SPEED EXTRACTION</span><strong>速度提取</strong></div>
        <div className="privacy-pill"><span />LOCAL PROCESSING</div>
      </header>
      <div className="capture-body">
        <div className="roi-previews">
          <figure><figcaption>速度区域</figcaption>{props.previewSpeed ? <img src={props.previewSpeed} alt="速度区域放大预览" /> : <span>等待视频画面</span>}</figure>
          <figure><figcaption>计时区域</figcaption>{props.previewTimer ? <img src={props.previewTimer} alt="计时区域放大预览" /> : <span>等待视频画面</span>}</figure>
        </div>
        <button className="locate-action" disabled={props.disabled || props.busy} onClick={props.onAutoLocate}><WandSparkles size={14} />自动定位右上角数字区域</button>
        <div className="capture-divider"><span>自动分析范围</span></div>
        <div className="scope-switch">
          <button className={props.scope === 'full' ? 'active' : ''} onClick={() => props.onScope('full')}>整段视频</button>
          <button className={props.scope === 'range' ? 'active' : ''} onClick={() => props.onScope('range')}>指定区间</button>
        </div>
        {props.scope === 'range' && <div className="range-fields">
          <label>开始秒<input type="number" min="0" max={props.duration} step="0.001" value={props.rangeStart} onChange={(e) => props.onRangeStart(Number(e.target.value))} /><button title="使用当前视频位置" onClick={() => props.onUseCurrent('start')}><Crosshair size={13} /></button></label>
          <label>结束秒<input type="number" min="0" max={props.duration} step="0.001" value={props.rangeEnd} onChange={(e) => props.onRangeEnd(Number(e.target.value))} /><button title="使用当前视频位置" onClick={() => props.onUseCurrent('end')}><Crosshair size={13} /></button></label>
        </div>}
        <button className="secondary-action" disabled={props.disabled || props.busy} onClick={props.onOcrCurrent}>{props.busy ? <LoaderCircle className="spin" size={17} /> : <Camera size={17} />}识别当前帧</button>
        <div className="auto-row">
          <label>每<input type="number" min="1" max="600" step="1" value={props.frameInterval} onChange={(e) => { const value = Number(e.target.value); props.onFrameInterval(Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1) }} /><span>帧采样</span></label>
          <button className={props.scanRunning ? 'stop' : ''} disabled={props.disabled || (props.busy && !props.scanRunning)} onClick={props.onAutoScan}><Bot size={17} />{props.scanRunning ? '停止分析' : '开始分析'}</button>
        </div>
        {props.currentResult && <div className="current-frame-result">
          <div className="current-result-heading"><span>当前帧识别结果</span><em>{props.currentResult.videoTime.toFixed(3)}s · {props.currentResult.engine} · {Math.round(props.currentResult.confidence)}%</em></div>
          <label><span>速度</span><div><input inputMode="numeric" value={props.currentSpeed} onChange={(event) => props.onCurrentSpeed(event.target.value.replace(/\D/g, '').slice(0, 3))} /><small>km/h</small></div></label>
          <label><span>局内时间</span><input inputMode="decimal" value={props.currentGameTime} onChange={(event) => props.onCurrentGameTime(event.target.value)} placeholder="00:00.000" /></label>
          <button className="add-current-result" disabled={props.busy} onClick={props.onAddCurrent}><Check size={15} />手动确认并添加</button>
          <p>可直接修正上方识别值；添加后作为人工真值永久锁定。</p>
        </div>}
        <div className="fps-note">视频帧率：{props.frameRate ? `${props.frameRate.toFixed(2)} FPS` : '分析开始时自动检测'} · 预计采样间隔 {props.frameRate ? (props.frameInterval / props.frameRate).toFixed(3) : '—'} 秒</div>
        <div className={`capture-progress ${props.busy ? 'active' : ''}`}><Sparkles size={14} /><span>{props.progress || '先在放大预览中确认两个 ROI 只包含数字，再开始自动分析'}</span></div>
      </div>
    </section>
  )
}
