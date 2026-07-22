import { Download, FileSpreadsheet, FileText, Pencil, Trash2 } from 'lucide-react'
import { hasRawDifference, rawValues } from '../lib/telemetryValues'
import type { DataPreference, TelemetryPoint } from '../types'

interface Props {
  points: TelemetryPoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onClear: () => void
  exportName: string
  onExportName: (value: string) => void
  exportPreference: DataPreference
  onExportPreference: (value: DataPreference) => void
  onExportCsv: () => void
  onExportXlsx: () => void
}

export function DataPanel({ points, selectedId, onSelect, onDelete, onClear, exportName, onExportName, exportPreference, onExportPreference, onExportCsv, onExportXlsx }: Props) {
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
        ) : points.map((point, index) => {
          const raw = rawValues(point)
          const differs = hasRawDifference(point)
          return (
          <article key={point.id} className={selectedId === point.id ? 'selected' : ''} onClick={() => onSelect(point.id)}>
            <div className="record-index"><span>#{String(index + 1).padStart(3, '0')}</span><em>{point.source}{point.locked || point.source === '手动' ? ' · 已锁定' : ''}{point.confidence != null ? ` · ${Math.round(point.confidence)}%` : ''}{point.corrected ? ' · 时间已修正' : ''}{point.speedCorrected ? ` · ${point.speedCorrectionReason ?? '速度已修正'}` : ''}</em></div>
            <div className="record-values">
              <span><em>修正后</em><strong>{point.speed}<small> km/h</small></strong><time>{point.gameTime}</time></span>
              <span className={differs ? 'raw differs' : 'raw'}><em>原始 OCR</em><strong>{raw.speed}<small> km/h</small></strong><time>{raw.gameTime}</time></span>
            </div>
            <button className="record-edit" aria-label="选择并编辑"><Pencil size={14} /></button>
            <button className="record-delete" aria-label="删除记录" onClick={(event) => { event.stopPropagation(); onDelete(point.id) }}><Trash2 size={14} /></button>
          </article>
        )})}
      </div>
      <div className="export-box">
        <div className="export-title"><span><Download size={15} />导出数据</span><em>{points.length ? 'READY' : 'NO DATA'}</em></div>
        <p>选择表格主列采用哪组数据；原始 OCR 与修正后数据都会作为对照列保留。</p>
        <div className="export-preference" role="group" aria-label="导出数据偏好">
          <button className={exportPreference === 'corrected' ? 'active' : ''} onClick={() => onExportPreference('corrected')}>优先保留修正后</button>
          <button className={exportPreference === 'raw' ? 'active' : ''} onClick={() => onExportPreference('raw')}>优先保留原始 OCR</button>
        </div>
        <label className="export-name"><span>文件名称</span><input value={exportName} placeholder="A9_速度分析" onChange={(event) => onExportName(event.target.value)} /></label>
        <div>
          <button disabled={!points.length} onClick={onExportCsv}><FileText size={17} /><span>CSV<small>通用数据</small></span></button>
          <button disabled={!points.length} onClick={onExportXlsx}><FileSpreadsheet size={17} /><span>XLSX<small>含统计摘要</small></span></button>
        </div>
      </div>
    </aside>
  )
}
