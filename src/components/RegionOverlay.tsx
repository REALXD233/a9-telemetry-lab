import { useRef } from 'react'
import type { CropRegion, RegionKind } from '../types'

interface Props {
  kind: RegionKind
  region: CropRegion
  active: boolean
  onActivate: () => void
  onChange: (region: CropRegion) => void
}

export function RegionOverlay({ kind, region, active, onActivate, onChange }: Props) {
  const state = useRef<{ startX: number; startY: number; original: CropRegion; mode: 'move' | 'resize' } | null>(null)

  const start = (event: React.PointerEvent, mode: 'move' | 'resize') => {
    event.stopPropagation()
    onActivate()
    const element = event.currentTarget as HTMLElement
    element.setPointerCapture(event.pointerId)
    state.current = { startX: event.clientX, startY: event.clientY, original: region, mode }
  }

  const move = (event: React.PointerEvent) => {
    if (!state.current) return
    const parent = (event.currentTarget as HTMLElement).parentElement
    if (!parent) return
    const dx = (event.clientX - state.current.startX) / parent.clientWidth
    const dy = (event.clientY - state.current.startY) / parent.clientHeight
    const original = state.current.original
    if (state.current.mode === 'move') {
      onChange({ ...original, x: clamp(original.x + dx, 0, 1 - original.width), y: clamp(original.y + dy, 0, 1 - original.height) })
    } else {
      onChange({ ...original, width: clamp(original.width + dx, 0.07, 1 - original.x), height: clamp(original.height + dy, 0.05, 1 - original.y) })
    }
  }

  return (
    <div
      className={`roi roi-${kind} ${active ? 'is-active' : ''}`}
      style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}
      onPointerDown={(event) => start(event, 'move')}
      onPointerMove={move}
      onPointerUp={() => (state.current = null)}
    >
      <span>{kind === 'speed' ? '速度区域' : '计时区域'}</span>
      <i
        className="roi-handle"
        onPointerDown={(event) => start(event, 'resize')}
        onPointerMove={move}
        onPointerUp={() => (state.current = null)}
      />
    </div>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
