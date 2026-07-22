import { Bot, Gauge, RotateCcw, ShieldCheck, Smartphone, Sparkles } from 'lucide-react'
import type { RecognitionSettings, SpeedCheckSettings } from '../types'

interface Props {
  settings: RecognitionSettings
  onChange: (settings: RecognitionSettings) => void
  onReset: () => void
}

const CHECKS: { key: keyof SpeedCheckSettings; title: string; detail: string }[] = [
  { key: 'speedJump', title: '相邻帧速度变化限制', detail: '当前点与前后采样帧都超过阈值时，按两侧趋势修正 · 性能影响极低' },
  { key: 'localTrend', title: '局部趋势检查', detail: '结合前后趋势修正 5 / 9 混淆 · 性能影响极低' },
  { key: 'fillShortGaps', title: '填补短暂空缺', detail: '对最多连续两次 OCR 漏检做线性插值 · 性能影响极低' },
  { key: 'localMedian', title: '局部中位数检查', detail: '用最多五点窗口发现孤立极值 · 性能影响低' },
  { key: 'neighborAgreement', title: '两端一致性保护', detail: '前后趋势分歧较大时不自动修改 · 性能影响极低' },
]

export function SettingsPage({ settings, onChange, onReset }: Props) {
  const number = (key: 'maxSpeed' | 'maxSpeedChangePerFrame' | 'localDeviation', value: number) => {
    onChange({ ...settings, [key]: Number.isFinite(value) ? Math.max(0, value) : 0 })
  }
  const toggle = (key: keyof SpeedCheckSettings) => {
    onChange({ ...settings, checks: { ...settings.checks, [key]: !settings.checks[key] } })
  }
  return (
    <main className="subpage-main settings-main">
      <section className="subpage-hero">
        <div><span className="eyebrow">RECOGNITION PROFILE</span><h1>识别与质量检查设置</h1><p>选择速度识别引擎，并控制哪些异常数据可以被自动标记和修正。</p></div>
        <div className="hero-stat"><ShieldCheck size={34} /><span>当前配置<strong>{settings.model === 'a9-cn' ? 'A9 国服模型' : '默认 OCR'}</strong></span></div>
      </section>

      <section className="settings-grid">
        <div className="panel settings-card model-settings">
          <header><Bot size={18} /><div><strong>识别模型</strong><span>速度区域使用的识别引擎</span></div></header>
          <div className="model-options">
            <button className={settings.model === 'default' ? 'active' : ''} onClick={() => onChange({ ...settings, model: 'default' })}>
              <i /><strong>默认数字 OCR</strong><span>兼容不同画面与服务器版本，速度较慢</span><em>GENERIC</em>
            </button>
            <button className={settings.model === 'a9-cn' ? 'active' : ''} onClick={() => onChange({ ...settings, model: 'a9-cn' })}>
              <i /><strong>A9 国服速度模型</strong><span>使用专用速度字库，速度更快并降低 5 / 9 混淆</span><em>RECOMMENDED</em>
            </button>
          </div>
          <div className="mobile-note"><Smartphone size={15} /><span>OCR 工作线程、核心和语言包已随应用本地提供，手机端无需访问第三方 CDN。</span></div>
        </div>

        <div className="panel settings-card threshold-settings">
          <header><Gauge size={18} /><div><strong>阈值预设</strong><span>决定何时将速度视为异常</span></div></header>
          <div className="threshold-grid">
            <label><span>最大速度 <small>KM/H</small></span><input type="number" min="100" max="999" value={settings.maxSpeed} onChange={(event) => number('maxSpeed', Number(event.target.value))} /></label>
            <label><span>相邻帧最大变化 <small>KM/H / 帧</small></span><input type="number" min="1" value={settings.maxSpeedChangePerFrame} onChange={(event) => number('maxSpeedChangePerFrame', Number(event.target.value))} /></label>
            <label><span>局部偏差 <small>KM/H</small></span><input type="number" min="1" value={settings.localDeviation} onChange={(event) => number('localDeviation', Number(event.target.value))} /></label>
          </div>
          <p className="threshold-help"><strong>局部偏差</strong>是 OCR 值偏离邻域插值或中位数后，允许保留的最大误差。数值越小，修正越积极；数值越大，越倾向保留 OCR 原值。</p>
        </div>

        <div className="panel settings-card checks-settings">
          <header><Sparkles size={18} /><div><strong>分析步骤</strong><span>所有自动修正都会保留原始值并在复查页标注</span></div></header>
          <div className="check-grid">
            {CHECKS.map((item) => <button key={item.key} className={settings.checks[item.key] ? 'enabled' : ''} onClick={() => toggle(item.key)}><i>{settings.checks[item.key] ? '✓' : ''}</i><span><strong>{item.title}</strong><small>{item.detail}</small></span></button>)}
          </div>
        </div>
      </section>
      <button className="settings-reset" onClick={onReset}><RotateCcw size={15} />恢复推荐设置</button>
    </main>
  )
}
