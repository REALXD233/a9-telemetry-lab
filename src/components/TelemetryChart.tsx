import { useEffect, useId, useState } from 'react'
import { Activity, Eye, EyeOff, Maximize2 } from 'lucide-react'
import type { DataDisplayMode, TelemetryPoint } from '../types'
import { ChartModal } from './ChartModal'
import { SvgPointTooltip } from './SvgPointTooltip'
import { hasRawDifference, rawValues } from '../lib/telemetryValues'

interface Props {
  points: TelemetryPoint[]
  displayMode: DataDisplayMode
  onDisplayMode: (value: DataDisplayMode) => void
}

export function TelemetryChart({ points, displayMode, onDisplayMode }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [showPoints, setShowPoints] = useState(true)
  const chart = <SpeedChart points={points} showPoints={showPoints} displayMode={displayMode} />
  return (
    <>
      <section className="panel chart-panel">
        <header className="panel-header">
          <div><span className="eyebrow">PERFORMANCE CURVE</span><strong>速度 / 局内时间</strong></div>
          <div className="chart-legend">
            {displayMode !== 'raw' && <span><i />修正后</span>}
            {displayMode !== 'corrected' && <span className="raw-legend"><i />原始 OCR</span>}
            <div className="chart-mode-switch" role="group" aria-label="曲线显示模式">
              <button className={displayMode === 'both' ? 'active' : ''} onClick={() => onDisplayMode('both')}>双线</button>
              <button className={displayMode === 'raw' ? 'active' : ''} onClick={() => onDisplayMode('raw')}>原始</button>
              <button className={displayMode === 'corrected' ? 'active' : ''} onClick={() => onDisplayMode('corrected')}>修正</button>
            </div>
            <span>{points.length} 个样本</span><button className="chart-toggle" disabled={!points.length} onClick={() => setShowPoints((value) => !value)} title={showPoints ? '隐藏数据点' : '显示数据点'}>{showPoints ? <Eye size={14} /> : <EyeOff size={14} />}{showPoints ? '隐藏点' : '显示点'}</button><button className="icon-maximize" disabled={!points.length} onClick={() => setExpanded(true)} title="放大 V–T 图"><Maximize2 size={15} /></button>
          </div>
        </header>
        <div className="chart-wrap">{chart}</div>
      </section>
      {expanded && <ChartModal title="速度 / 局内时间" subtitle={`${points.length} 个样本`} onClose={() => setExpanded(false)}>{chart}</ChartModal>}
    </>
  )
}

type ChartSelection = { point: TelemetryPoint; series: 'raw' | 'corrected' }

function SpeedChart({ points, showPoints, displayMode }: Pick<Props, 'points' | 'displayMode'> & { showPoints: boolean }) {
  const [hovered, setHovered] = useState<ChartSelection | null>(null)
  const [pinned, setPinned] = useState<ChartSelection | null>(null)
  const active = pinned ?? hovered
  useEffect(() => { setHovered(null); setPinned(null) }, [displayMode])
  const sorted = [...points].sort((a, b) => a.videoTime - b.videoTime)
  const rawSeries = sorted.map((point) => ({ point, values: rawValues(point) }))
  const gradientId = useId().replace(/:/g, '')
  const width = 900
  const height = 260
  const padding = { left: 60, right: 26, top: 28, bottom: 62 }
  const allTimes = [
    ...(displayMode !== 'raw' ? sorted.map((point) => point.timeSeconds) : []),
    ...(displayMode !== 'corrected' ? rawSeries.map((item) => item.values.timeSeconds) : []),
  ]
  const minT = Math.min(...allTimes)
  const maxT = Math.max(...allTimes)
  const visibleSpeeds = [
    ...(displayMode !== 'raw' ? sorted.map((point) => point.speed) : []),
    ...(displayMode !== 'corrected' ? rawSeries.map((item) => item.values.speed) : []),
  ]
  const maxV = Math.max(100, ...visibleSpeeds)
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
            {displayMode !== 'raw' && <path d={`${correctedPath} L ${x(sorted.at(-1)!.timeSeconds)} ${height - padding.bottom} L ${x(sorted[0].timeSeconds)} ${height - padding.bottom} Z`} fill={`url(#${gradientId}-fill)`} />}
            {displayMode !== 'corrected' && <path d={rawPath} className="raw-speed-line" />}
            {displayMode !== 'raw' && <path d={correctedPath} className="speed-line" filter={`url(#${gradientId}-glow)`} />}
            {showPoints && displayMode !== 'corrected' && rawSeries.filter(({ point }) => displayMode === 'raw' || hasRawDifference(point)).map(({ point, values }) => <g key={`${point.id}-raw`} className="chart-point" onPointerEnter={() => setHovered({ point, series: 'raw' })} onPointerLeave={() => setHovered(null)} onClick={(event) => { event.stopPropagation(); setPinned((current) => current?.point.id === point.id && current.series === 'raw' ? null : { point, series: 'raw' }) }}>
              <circle cx={x(values.timeSeconds)} cy={y(values.speed)} r="9" className="chart-hit" />
              <circle cx={x(values.timeSeconds)} cy={y(values.speed)} r="3.5" className="raw-chart-dot" />
            </g>)}
            {showPoints && displayMode !== 'raw' && sorted.map((point) => <g key={point.id} className="chart-point" onPointerEnter={() => setHovered({ point, series: 'corrected' })} onPointerLeave={() => setHovered(null)} onClick={(event) => { event.stopPropagation(); setPinned((current) => current?.point.id === point.id && current.series === 'corrected' ? null : { point, series: 'corrected' }) }}>
              <circle cx={x(point.timeSeconds)} cy={y(point.speed)} r="9" className="chart-hit" />
              <circle cx={x(point.timeSeconds)} cy={y(point.speed)} r="4" className="chart-dot" />
            </g>)}
            {showPoints && active && <SvgPointTooltip x={x(active.series === 'raw' ? rawValues(active.point).timeSeconds : active.point.timeSeconds)} y={y(active.series === 'raw' ? rawValues(active.point).speed : active.point.speed)} width={width} height={height} color={active.series === 'raw' ? '#9ba4a7' : '#b7f34b'} lines={displayMode === 'both' ? [`修正后  ${active.point.gameTime} · ${active.point.speed} km/h`, `原始 OCR  ${rawValues(active.point).gameTime} · ${rawValues(active.point).speed} km/h`, `视频位置  ${active.point.videoTime.toFixed(3)}s${hasRawDifference(active.point) ? ' · 两组数据有差异' : ''}`] : displayMode === 'raw' ? [`原始 OCR  ${rawValues(active.point).gameTime}`, `速度  ${rawValues(active.point).speed} km/h`, `视频位置  ${active.point.videoTime.toFixed(3)}s`] : [`修正后  ${active.point.gameTime}`, `速度  ${active.point.speed} km/h`, `视频位置  ${active.point.videoTime.toFixed(3)}s${hasRawDifference(active.point) ? ' · 已修正' : ''}`]} />}
          </svg>
  )
}
