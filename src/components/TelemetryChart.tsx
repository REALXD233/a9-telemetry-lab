import { useId, useState } from 'react'
import { Activity, Eye, EyeOff, Maximize2 } from 'lucide-react'
import type { TelemetryPoint } from '../types'
import { ChartModal } from './ChartModal'
import { SvgPointTooltip } from './SvgPointTooltip'
import { hasRawDifference, rawValues } from '../lib/telemetryValues'

interface Props { points: TelemetryPoint[] }

export function TelemetryChart({ points }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [showPoints, setShowPoints] = useState(true)
  const chart = <SpeedChart points={points} showPoints={showPoints} />
  return (
    <>
      <section className="panel chart-panel">
        <header className="panel-header">
          <div><span className="eyebrow">PERFORMANCE CURVE</span><strong>速度 / 局内时间</strong></div>
          <div className="chart-legend"><span><i />修正后</span><span className="raw-legend"><i />原始 OCR</span><span>{points.length} 个样本</span><button className="chart-toggle" disabled={!points.length} onClick={() => setShowPoints((value) => !value)} title={showPoints ? '隐藏数据点' : '显示数据点'}>{showPoints ? <Eye size={14} /> : <EyeOff size={14} />}{showPoints ? '隐藏点' : '显示点'}</button><button className="icon-maximize" disabled={!points.length} onClick={() => setExpanded(true)} title="放大 V–T 图"><Maximize2 size={15} /></button></div>
        </header>
        <div className="chart-wrap">{chart}</div>
      </section>
      {expanded && <ChartModal title="速度 / 局内时间" subtitle={`${points.length} 个样本`} onClose={() => setExpanded(false)}>{chart}</ChartModal>}
    </>
  )
}

function SpeedChart({ points, showPoints }: Props & { showPoints: boolean }) {
  const [hovered, setHovered] = useState<TelemetryPoint | null>(null)
  const [pinned, setPinned] = useState<TelemetryPoint | null>(null)
  const active = pinned ?? hovered
  const sorted = [...points].sort((a, b) => a.videoTime - b.videoTime)
  const rawSeries = sorted.map((point) => ({ point, values: rawValues(point) }))
  const gradientId = useId().replace(/:/g, '')
  const width = 900
  const height = 260
  const padding = { left: 60, right: 26, top: 28, bottom: 62 }
  const allTimes = [...sorted.map((point) => point.timeSeconds), ...rawSeries.map((item) => item.values.timeSeconds)]
  const minT = Math.min(...allTimes)
  const maxT = Math.max(...allTimes)
  const maxV = Math.max(100, ...sorted.map((point) => point.speed), ...rawSeries.map((item) => item.values.speed))
  const x = (time: number) => padding.left + ((time - minT) / Math.max(1, maxT - minT)) * (width - padding.left - padding.right)
  const y = (speed: number) => height - padding.bottom - (speed / maxV) * (height - padding.top - padding.bottom)
  const correctedPath = sorted.map((point, index) => `${index ? 'L' : 'M'} ${x(point.timeSeconds)} ${y(point.speed)}`).join(' ')
  const rawPath = rawSeries.map((item, index) => `${index ? 'L' : 'M'} ${x(item.values.timeSeconds)} ${y(item.values.speed)}`).join(' ')

  return !points.length ? (
    <div className="chart-empty"><Activity size={22} /><span>采集数据后将在这里生成 v‑t 曲线</span></div>
  ) : (
          <svg className="telemetry-svg interactive-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="速度随局内时间变化曲线" onPointerLeave={() => setHovered(null)} onClick={() => setPinned(null)}>
            <defs>
              <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b7f34b" stopOpacity=".24" /><stop offset="1" stopColor="#b7f34b" stopOpacity="0" /></linearGradient>
              <filter id={`${gradientId}-glow`}><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            {[0, .25, .5, .75, 1].map((ratio) => {
              const gy = padding.top + ratio * (height - padding.top - padding.bottom)
              return <g key={ratio}><line x1={padding.left} y1={gy} x2={width - padding.right} y2={gy} className="grid-line" /><text x={padding.left - 10} y={gy + 4} textAnchor="end">{Math.round(maxV * (1 - ratio))}</text></g>
            })}
            {[0, .25, .5, .75, 1].map((ratio) => {
              const gx = padding.left + ratio * (width - padding.left - padding.right)
              const value = minT + ratio * (maxT - minT)
              return <g key={`x-${ratio}`}><line x1={gx} y1={padding.top} x2={gx} y2={height - padding.bottom} className="grid-line" /><text x={gx} y={height - 38} textAnchor="middle">{value.toFixed(2)}s</text></g>
            })}
            <text className="axis-label" x="15" y="20">速度（KM/H）</text>
            <text className="axis-label x-axis-title" x={width / 2} y={height - 10} textAnchor="middle">局内时间（秒）</text>
            <path d={`${correctedPath} L ${x(sorted.at(-1)!.timeSeconds)} ${height - padding.bottom} L ${x(sorted[0].timeSeconds)} ${height - padding.bottom} Z`} fill={`url(#${gradientId}-fill)`} />
            <path d={rawPath} className="raw-speed-line" />
            <path d={correctedPath} className="speed-line" filter={`url(#${gradientId}-glow)`} />
            {showPoints && rawSeries.filter(({ point }) => hasRawDifference(point)).map(({ point, values }) => <circle key={`${point.id}-raw`} cx={x(values.timeSeconds)} cy={y(values.speed)} r="3.5" className="raw-chart-dot" />)}
            {showPoints && sorted.map((point) => <g key={point.id} className="chart-point" onPointerEnter={() => setHovered(point)} onPointerLeave={() => setHovered(null)} onClick={(event) => { event.stopPropagation(); setPinned((current) => current?.id === point.id ? null : point) }}>
              <circle cx={x(point.timeSeconds)} cy={y(point.speed)} r="9" className="chart-hit" />
              <circle cx={x(point.timeSeconds)} cy={y(point.speed)} r="4" className="chart-dot" />
            </g>)}
            {showPoints && active && <SvgPointTooltip x={x(active.timeSeconds)} y={y(active.speed)} width={width} height={height} color="#b7f34b" lines={[`修正后  ${active.gameTime} · ${active.speed} km/h`, `原始 OCR  ${rawValues(active).gameTime} · ${rawValues(active).speed} km/h`, `视频位置  ${active.videoTime.toFixed(3)}s${hasRawDifference(active) ? ' · 两组数据有差异' : ''}`]} />}
          </svg>
  )
}
