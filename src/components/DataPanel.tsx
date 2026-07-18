import { Download, FileSpreadsheet, FileText, Pencil, Trash2 } from 'lucide-react'
import type { TelemetryPoint } from '../types'

interface Props {
  points: TelemetryPoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onClear: () => void
  exportName: string
  onExportName: (value: string) => void
  onExportCsv: () => void
  onExportXlsx: () => void
}

export function DataPanel({ points, selectedId, onSelect, onDelete, onClear, exportName, onExportName, onExportCsv, onExportXlsx }: Props) {
  const max = points.length ? Math.max(...points.map((point) => point.speed)) : 0
  const average = points.length ? Math.round(points.reduce((sum, point) => sum + point.speed, 0) / points.length) : 0
  return (
    <aside className="data-panel">
      <div className="data-summary">
        <div><span>数据样本</span><strong>{String(points.length).padStart(2, '0')}</strong></div>
        <div><span>最高速度</span><strong>{max}<small> km/h</small></strong></div>
        <div><span>平均速度</span><strong>{average}<small> km/h</small></strong></div>
      </div>
      <div className="data-heading"><div><span className="eyebrow">EXTRACTED LOG</span><h2>采集记录</h2></div><button disabled={!points.length} onClick={onClear}>清空</button></div>
      <div className="record-list">
        {!points.length ? (
          <div className="record-empty">暂无记录<br /><span>使用下方采集工具添加第一条数据</span></div>
        ) : points.map((point, index) => (
          <article key={point.id} className={selectedId === point.id ? 'selected' : ''} onClick={() => onSelect(point.id)}>
            <div className="record-index"><span>#{String(index + 1).padStart(3, '0')}</span><em>{point.source}{point.confidence != null ? ` · ${Math.round(point.confidence)}%` : ''}{point.corrected ? ' · 时间已修正' : ''}{point.speedCorrected ? ` · ${point.speedCorrectionReason ?? '速度已修正'}` : ''}</em></div>
            <div className="record-values"><strong title={point.speedCorrected ? `OCR 原始速度：${point.rawSpeed} km/h` : undefined}>{point.speed}<small> km/h</small></strong><time>{point.gameTime}</time></div>
            <button className="record-edit" aria-label="选择并编辑"><Pencil size={14} /></button>
            <button className="record-delete" aria-label="删除记录" onClick={(event) => { event.stopPropagation(); onDelete(point.id) }}><Trash2 size={14} /></button>
          </article>
        ))}
      </div>
      <div className="export-box">
        <div className="export-title"><span><Download size={15} />导出数据</span><em>{points.length ? 'READY' : 'NO DATA'}</em></div>
        <p>导出内容包含局内时间、速度、视频定位及采集来源。</p>
        <label className="export-name"><span>文件名称</span><input value={exportName} placeholder="A9_速度分析" onChange={(event) => onExportName(event.target.value)} /></label>
        <div>
          <button disabled={!points.length} onClick={onExportCsv}><FileText size={17} /><span>CSV<small>通用数据</small></span></button>
          <button disabled={!points.length} onClick={onExportXlsx}><FileSpreadsheet size={17} /><span>XLSX<small>含统计摘要</small></span></button>
        </div>
      </div>
    </aside>
  )
}
