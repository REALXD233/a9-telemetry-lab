import { Check, LockKeyhole, Plus, X } from 'lucide-react'
import { hasRawDifference, rawValues } from '../lib/telemetryValues'
import type { TelemetryPoint } from '../types'

interface Props {
  speed: string
  gameTime: string
  selected: TelemetryPoint | null
  disabled: boolean
  onSpeed: (value: string) => void
  onGameTime: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

export function ReviewForm({ speed, gameTime, selected, disabled, onSpeed, onGameTime, onSave, onCancel }: Props) {
  const raw = selected ? rawValues(selected) : null
  return (
    <section className="panel review-form">
      <header className="panel-header">
        <div><span className="eyebrow">MANUAL GROUND TRUTH</span><strong>{selected ? '复查并修正记录' : '添加人工真值'}</strong></div>
        <div className="review-lock"><LockKeyhole size={13} />人工数据永久锁定</div>
      </header>
      <div className="review-form-body">
        <p>{selected ? `正在编辑视频 ${selected.videoTime.toFixed(3)}s 处的数据。保存后，自动识别与异常修正不会覆盖它。` : '逐帧定位后输入正确数据；人工真值可作为后续时间与速度修正的可靠锚点。'}</p>
        {selected && raw && <div className={`review-comparison ${hasRawDifference(selected) ? 'differs' : ''}`}>
          <span><small>OCR 原始</small><strong>{raw.speed} km/h</strong><time>{raw.gameTime}</time></span>
          <i>→</i>
          <span><small>当前修正</small><strong>{selected.speed} km/h</strong><time>{selected.gameTime}</time></span>
        </div>}
        <div className="field-group"><label htmlFor="review-speed">速度 <span>KM/H</span></label><div><input id="review-speed" inputMode="numeric" placeholder="—" value={speed} onChange={(event) => onSpeed(event.target.value.replace(/\D/g, '').slice(0, 3))} /><small>km/h</small></div></div>
        <div className="field-group"><label htmlFor="review-time">局内时间 <span>单调递增</span></label><div><input id="review-time" inputMode="decimal" placeholder="00:00.000" value={gameTime} onChange={(event) => onGameTime(event.target.value)} /></div></div>
        <div className="review-actions">
          {selected && <button className="review-cancel" onClick={onCancel}><X size={15} />取消</button>}
          <button className="primary-action" disabled={disabled} onClick={onSave}>{selected ? <Check size={16} /> : <Plus size={16} />}{selected ? '保存并锁定修正' : '添加并锁定记录'}</button>
        </div>
      </div>
    </section>
  )
}
