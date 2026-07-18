import { useMemo, useRef, useState } from 'react'
import { BarChart3, Eye, EyeOff, FileImage, FileSpreadsheet, Film, ImageDown, LoaderCircle, Maximize2, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { parseGameTime } from '../lib/time'
import { exportChartImage } from '../lib/chartExport'
import { exportComparisonVideo, type ChartVideoProgress } from '../lib/chartVideoExport'
import { ChartModal } from './ChartModal'
import { SvgPointTooltip } from './SvgPointTooltip'

interface ComparePoint { time: number; speed: number }
interface CompareSeries {
  id: string
  name: string
  color: string
  points: ComparePoint[]
  rangeStart: number
  rangeEnd: number
}
interface ChartPoint extends ComparePoint { displayTime: number; originalTime: number }
interface ChartSeries extends Omit<CompareSeries, 'points'> { points: ChartPoint[] }
type TimeMode = 'absolute' | 'aligned'

const COLORS = ['#b7f34b', '#609cff', '#ff8f76', '#ffbd59', '#c58cff', '#45d7c6', '#f26dc6', '#91a7ff']

export function ComparisonPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const [series, setSeries] = useState<CompareSeries[]>([])
  const [message, setMessage] = useState('可同时选择多个 CSV 或 XLSX；工作簿中的多个工作表会分别生成曲线。')
  const [expanded, setExpanded] = useState(false)
  const [timeMode, setTimeMode] = useState<TimeMode>('absolute')
  const [showPoints, setShowPoints] = useState(true)
  const [imageName, setImageName] = useState('A9_VT_对比图')
  const [videoRate, setVideoRate] = useState(1)
  const [videoProgress, setVideoProgress] = useState<ChartVideoProgress | null>(null)

  const importFiles = async (files: FileList | File[]) => {
    const XLSX = await import('xlsx')
    const imported: Omit<CompareSeries, 'color'>[] = []
    const rejected: string[] = []
    for (const file of Array.from(files)) {
      try {
        const countBeforeFile = imported.length
        const fileBuffer = await file.arrayBuffer()
        const workbook = file.name.toLowerCase().endsWith('.csv')
          ? XLSX.read(new TextDecoder('utf-8').decode(fileBuffer), { type: 'string' })
          : XLSX.read(fileBuffer, { type: 'array' })
        for (const sheetName of workbook.SheetNames) {
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' })
          const points = rowsToPoints(rows)
          if (points.length < 2) continue
          const suffix = workbook.SheetNames.length > 1 ? ` / ${sheetName}` : ''
          imported.push({
            id: crypto.randomUUID(),
            name: `${file.name.replace(/\.[^.]+$/, '')}${suffix}`,
            points,
            rangeStart: points[0].time,
            rangeEnd: points.at(-1)!.time,
          })
        }
        if (imported.length === countBeforeFile) rejected.push(file.name)
      } catch {
        rejected.push(file.name)
      }
    }
    if (imported.length) {
      setSeries((current) => [...current, ...imported.map((item, index) => ({ ...item, color: COLORS[(current.length + index) % COLORS.length] }))])
    }
    setMessage(rejected.length
      ? `已导入 ${imported.length} 条曲线；无法识别：${rejected.join('、')}。请确认包含时间和速度列。`
      : `已导入 ${imported.length} 条曲线，共 ${imported.reduce((sum, item) => sum + item.points.length, 0)} 个数据点。`)
  }

  const chartSeries = useMemo<ChartSeries[]>(() => series.map((item) => ({
    ...item,
    points: item.points
      .filter((point) => point.time >= item.rangeStart - .0005 && point.time <= item.rangeEnd + .0005)
      .map((point) => ({ ...point, originalTime: point.time, displayTime: timeMode === 'aligned' ? point.time - item.rangeStart : point.time })),
  })).filter((item) => item.points.length), [series, timeMode])
  const chart = useMemo(() => <ComparisonChart series={chartSeries} timeMode={timeMode} showPoints={showPoints} />, [chartSeries, timeMode, showPoints])
  const videoSpan = useMemo(() => {
    const times = chartSeries.flatMap((item) => item.points.map((point) => point.displayTime))
    return times.length ? Math.max(...times) - Math.min(...times) : 0
  }, [chartSeries])

  const exportImage = async (format: 'png' | 'svg') => {
    const svg = chartRef.current?.querySelector('svg')
    if (!svg) return
    try {
      await exportChartImage(svg, imageName, format)
      setMessage(`V–T 对比图已导出为 ${format.toUpperCase()}。`)
    } catch (error) {
      setMessage(`图片导出失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  const exportVideo = async () => {
    if (!chartSeries.length || videoProgress) return
    setVideoProgress({ stage: 'recording', ratio: 0 })
    setMessage('正在生成动态 V–T 视频；请保持页面位于前台。')
    try {
      const result = await exportComparisonVideo(chartSeries.map((item) => ({
        name: item.name,
        color: item.color,
        points: item.points.map((point) => ({ time: point.displayTime, speed: point.speed })),
      })), {
        fileName: imageName.replace(/对比图$/, '动态图'),
        playbackRate: videoRate,
        timeLabel: timeMode === 'aligned' ? '相对片段时间（秒）' : '局内时间（秒）',
      }, setVideoProgress)
      setMessage(result.format === 'mp4'
        ? `动态 V–T 视频已导出为 MP4，时长约 ${result.duration.toFixed(1)} 秒。`
        : `MP4 转换失败，已导出兼容的 WebM 视频：${result.warning}`)
    } catch (error) {
      setMessage(`视频导出失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setVideoProgress(null)
    }
  }

  const updateRange = (id: string, edge: 'start' | 'end', value: number) => {
    if (!Number.isFinite(value)) return
    setSeries((current) => current.map((item) => {
      if (item.id !== id) return item
      const minimum = item.points[0].time
      const maximum = item.points.at(-1)!.time
      return edge === 'start'
        ? { ...item, rangeStart: Math.max(minimum, Math.min(value, item.rangeEnd)) }
        : { ...item, rangeEnd: Math.min(maximum, Math.max(value, item.rangeStart)) }
    }))
  }

  return (
    <main className="subpage-main compare-page">
      <section className="subpage-hero">
        <div><span className="eyebrow">MULTI-RUN COMPARISON</span><h1>多组速度–时间对比</h1><p>为每条记录选择需要的片段，并按原始局内时间或片段起点对齐后进行比较。</p></div>
        <div className="hero-stat"><BarChart3 size={20} /><span>当前曲线<strong>{chartSeries.length}</strong></span><span>片段数据点<strong>{chartSeries.reduce((sum, item) => sum + item.points.length, 0)}</strong></span></div>
      </section>
      <section className="compare-layout">
        <aside className="panel compare-import">
          <header className="panel-header"><div><span className="eyebrow">DATA INPUT</span><strong>导入与片段选择</strong></div><FileSpreadsheet size={18} /></header>
          <button className="compare-drop" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importFiles(event.dataTransfer.files) }}>
            <Upload size={26} /><strong>选择或拖入表格</strong><span>CSV / XLSX · 支持多文件与多工作表</span>
          </button>
          <input ref={inputRef} hidden type="file" multiple accept=".csv,.xlsx,.xls" onChange={(event) => event.target.files && void importFiles(event.target.files)} />
          <p className="compare-message">{message}</p>
          <div className="compare-time-mode">
            <span>横轴时间方式</span>
            <div><button className={timeMode === 'absolute' ? 'active' : ''} onClick={() => setTimeMode('absolute')}>保留局内时间</button><button className={timeMode === 'aligned' ? 'active' : ''} onClick={() => setTimeMode('aligned')}>片段起点归零</button></div>
            <small>{timeMode === 'absolute' ? '适合起点相同或需要观察真实时刻的片段' : '适合起点不同但需要比较加速过程的片段'}</small>
          </div>
          <div className="series-list">
            {!series.length ? <span>尚未导入数据</span> : series.map((item) => {
              const clippedCount = item.points.filter((point) => point.time >= item.rangeStart - .0005 && point.time <= item.rangeEnd + .0005).length
              return <article key={item.id}>
                <div className="series-title"><i style={{ background: item.color }} /><div><strong>{item.name}</strong><small>{clippedCount} / {item.points.length} 个点</small></div><button title="移除曲线" onClick={() => setSeries((current) => current.filter((seriesItem) => seriesItem.id !== item.id))}><X size={14} /></button></div>
                <div className="series-range"><label>起点<input type="number" step="0.001" value={item.rangeStart} onChange={(event) => updateRange(item.id, 'start', Number(event.target.value))} /></label><label>终点<input type="number" step="0.001" value={item.rangeEnd} onChange={(event) => updateRange(item.id, 'end', Number(event.target.value))} /></label><button title="恢复完整片段" onClick={() => setSeries((current) => current.map((seriesItem) => seriesItem.id === item.id ? { ...seriesItem, rangeStart: seriesItem.points[0].time, rangeEnd: seriesItem.points.at(-1)!.time } : seriesItem))}><RotateCcw size={13} /></button></div>
              </article>
            })}
          </div>
          <button className="clear-series" disabled={!series.length} onClick={() => setSeries([])}><Trash2 size={14} />清空全部曲线</button>
        </aside>
        <section className="panel compare-chart-panel">
          <header className="panel-header"><div><span className="eyebrow">COMPARISON CURVE</span><strong>V–T 对比图</strong></div><div className="compare-chart-actions"><button className="maximize-action" disabled={!chartSeries.length} onClick={() => setShowPoints((value) => !value)}>{showPoints ? <Eye size={15} /> : <EyeOff size={15} />}{showPoints ? '隐藏点' : '显示点'}</button><button className="maximize-action" disabled={!chartSeries.length} onClick={() => setExpanded(true)}><Maximize2 size={16} />放大</button></div></header>
          <div className="compare-export-bar"><label><span>导出名称</span><input value={imageName} onChange={(event) => setImageName(event.target.value)} /></label><button disabled={!chartSeries.length || Boolean(videoProgress)} onClick={() => void exportImage('png')}><ImageDown size={14} />导出 PNG</button><button disabled={!chartSeries.length || Boolean(videoProgress)} onClick={() => void exportImage('svg')}><FileImage size={14} />导出 SVG</button></div>
          <div className="compare-video-export">
            <div><Film size={16} /><span><strong>动态 V–T 视频</strong><small>曲线逐步显现，当前节点与速度实时高亮</small></span></div>
            <label>播放倍率<select value={videoRate} disabled={Boolean(videoProgress)} onChange={(event) => setVideoRate(Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label>
            <span className="video-estimate">预计成片 {chartSeries.length ? (videoSpan / videoRate + 1.3).toFixed(1) : '—'} 秒</span>
            <button disabled={!chartSeries.length || Boolean(videoProgress)} onClick={() => void exportVideo()}>{videoProgress ? <LoaderCircle className="spin" size={15} /> : <Film size={15} />}{videoProgress ? (videoProgress.stage === 'recording' ? `录制 ${Math.round(videoProgress.ratio * 100)}%` : `编码 ${Math.round(videoProgress.ratio * 100)}%`) : '导出 MP4'}</button>
            {videoProgress && <i style={{ width: `${Math.round(videoProgress.ratio * 100)}%` }} />}
          </div>
          <div ref={chartRef} className="compare-chart-wrap">{chart}</div>
        </section>
      </section>
      {expanded && <ChartModal title="多组 V–T 对比图" subtitle={`${chartSeries.length} 条片段 · ${timeMode === 'aligned' ? '起点已归零' : '保留局内时间'}`} onClose={() => setExpanded(false)}>{chart}</ChartModal>}
    </main>
  )
}

function rowsToPoints(rows: Record<string, unknown>[]) {
  if (!rows.length) return []
  const keys = Object.keys(rows[0])
  const normalized = new Map(keys.map((key) => [normalizeHeader(key), key]))
  const secondsKey = findKey(normalized, ['局内时间秒', '时间秒', 'timeseconds', 'timeins', 'seconds', 'second', 't'])
  const displayTimeKey = findKey(normalized, ['局内时间', '时间', 'gametime', 'time'])
  const speedKey = findKey(normalized, ['速度kmh', '速度', 'speedkmh', 'speed', 'velocity', 'v'])
  if ((!secondsKey && !displayTimeKey) || !speedKey) return []

  return rows.map((row): ComparePoint | null => {
    const rawTime = secondsKey ? row[secondsKey] : row[displayTimeKey!]
    const rawSpeed = row[speedKey]
    const numericTime = typeof rawTime === 'number' ? rawTime : Number(rawTime)
    const time = Number.isFinite(numericTime) ? numericTime : parseGameTime(String(rawTime))
    const speed = typeof rawSpeed === 'number' ? rawSpeed : Number(String(rawSpeed).replace(/[^\d.-]/g, ''))
    return time != null && Number.isFinite(speed) ? { time, speed } : null
  }).filter((point): point is ComparePoint => point != null && point.speed >= 0 && point.speed <= 1000)
    .sort((a, b) => a.time - b.time)
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[\s_\-()（）/]/g, '')
}

function findKey(keys: Map<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const exact = keys.get(alias)
    if (exact) return exact
  }
  for (const [normalized, original] of keys) {
    if (aliases.some((alias) => alias.length >= 3 && normalized.includes(alias))) return original
  }
  return null
}

function ComparisonChart({ series, timeMode, showPoints }: { series: ChartSeries[]; timeMode: TimeMode; showPoints: boolean }) {
  const [hovered, setHovered] = useState<{ series: ChartSeries; point: ChartPoint } | null>(null)
  const [pinned, setPinned] = useState<{ series: ChartSeries; point: ChartPoint } | null>(null)
  const active = pinned ?? hovered
  const width = 1200
  const height = 560
  const padding = { left: 80, right: 38, top: 54, bottom: 78 }
  const all = series.flatMap((item) => item.points)
  if (!all.length) return <div className="compare-empty"><BarChart3 size={30} /><strong>等待导入或选择有效片段</strong><span>每条曲线至少需要一个位于起点和终点范围内的数据点。</span></div>
  const minT = Math.min(...all.map((point) => point.displayTime))
  const maxT = Math.max(...all.map((point) => point.displayTime))
  const maxV = Math.max(100, ...all.map((point) => point.speed))
  const x = (time: number) => padding.left + ((time - minT) / Math.max(.001, maxT - minT)) * (width - padding.left - padding.right)
  const y = (speed: number) => height - padding.bottom - speed / maxV * (height - padding.top - padding.bottom)
  return <svg className="comparison-svg interactive-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="多组速度时间对比图" onPointerLeave={() => setHovered(null)} onClick={() => setPinned(null)}>
    {[0, .2, .4, .6, .8, 1].map((ratio) => { const gy = padding.top + ratio * (height - padding.top - padding.bottom); return <g key={`y${ratio}`}><line x1={padding.left} y1={gy} x2={width - padding.right} y2={gy} className="grid-line" /><text x={padding.left - 15} y={gy + 4} textAnchor="end">{Math.round(maxV * (1 - ratio))}</text></g> })}
    {[0, .25, .5, .75, 1].map((ratio) => { const gx = padding.left + ratio * (width - padding.left - padding.right); return <g key={`x${ratio}`}><line x1={gx} y1={padding.top} x2={gx} y2={height - padding.bottom} className="grid-line" /><text x={gx} y={height - 48} textAnchor="middle">{(minT + ratio * (maxT - minT)).toFixed(2)}s</text></g> })}
    <text className="axis-label" x="20" y="28">速度（KM/H）</text><text className="axis-label x-axis-title" x={width / 2} y={height - 14} textAnchor="middle">{timeMode === 'aligned' ? '相对片段时间（秒）' : '局内时间（秒）'}</text>
    {series.map((item) => <path key={item.id} d={item.points.map((point, index) => `${index ? 'L' : 'M'} ${x(point.displayTime)} ${y(point.speed)}`).join(' ')} fill="none" stroke={item.color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />)}
    {showPoints && series.flatMap((item) => item.points.map((point, index) => <g key={`${item.id}-${index}`} className="chart-point" onPointerEnter={() => setHovered({ series: item, point })} onPointerLeave={() => setHovered(null)} onClick={(event) => { event.stopPropagation(); setPinned((current) => current?.series.id === item.id && current.point === point ? null : { series: item, point }) }}>
      <circle cx={x(point.displayTime)} cy={y(point.speed)} r="9" className="chart-hit" />
      <circle cx={x(point.displayTime)} cy={y(point.speed)} r="3.5" fill={item.color} className="compare-dot" />
    </g>))}
    {series.map((item, index) => <g key={`legend-${item.id}`} transform={`translate(${padding.left + (index % 4) * 270}, ${18 + Math.floor(index / 4) * 18})`}><line x1="0" y1="0" x2="18" y2="0" stroke={item.color} strokeWidth="3" /><text x="25" y="4">{item.name}</text></g>)}
    {showPoints && active && <SvgPointTooltip x={x(active.point.displayTime)} y={y(active.point.speed)} width={width} height={height} color={active.series.color} lines={[active.series.name, `速度  ${active.point.speed} km/h`, `${timeMode === 'aligned' ? `片段时间  ${active.point.displayTime.toFixed(3)}s` : `局内时间  ${active.point.originalTime.toFixed(3)}s`}${timeMode === 'aligned' ? ` · 原始 ${active.point.originalTime.toFixed(3)}s` : ''}`]} />}
  </svg>
}
