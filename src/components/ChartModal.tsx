import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}

export function ChartModal({ title, subtitle, onClose, children }: Props) {
  return (
    <div className="chart-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section>
        <header><div><span className="eyebrow">EXPANDED VIEW</span><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div><button onClick={onClose} aria-label="关闭放大图表"><X size={20} /></button></header>
        <div className="chart-modal-body">{children}</div>
      </section>
    </div>
  )
}
