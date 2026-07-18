interface Props {
  x: number
  y: number
  width: number
  height: number
  color: string
  lines: string[]
}

export function SvgPointTooltip({ x, y, width, height, color, lines }: Props) {
  const boxWidth = 190
  const boxHeight = 18 + lines.length * 18
  const left = x + 14 + boxWidth > width ? x - boxWidth - 14 : x + 14
  const top = Math.max(8, Math.min(height - boxHeight - 8, y - boxHeight / 2))
  return <g className="svg-tooltip" pointerEvents="none">
    <rect x={left} y={top} width={boxWidth} height={boxHeight} rx="4" />
    <rect x={left} y={top} width="4" height={boxHeight} rx="2" fill={color} />
    {lines.map((line, index) => <text key={line} x={left + 14} y={top + 21 + index * 18} className={index === 0 ? 'tooltip-title' : ''}>{line}</text>)}
  </g>
}
