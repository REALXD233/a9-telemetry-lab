import { safeFileName } from './export'

const SVG_STYLE = `
  text { fill: #c5ccce; font-family: ui-monospace, Consolas, monospace; font-size: 9px; }
  .grid-line { stroke: #3b4245; stroke-width: 1; }
  .axis-label { fill: #f2f5f6; font-weight: 700; font-size: 10px; }
  .chart-hit { fill: transparent; stroke: transparent; }
  .compare-dot { stroke: #0b0d0e; stroke-width: 1.5; }
  .svg-tooltip { display: none; }
`

export async function exportChartImage(svg: SVGSVGElement, fileName: string, format: 'png' | 'svg') {
  const serialized = serializeChart(svg)
  const safeName = safeFileName(fileName, 'A9_VT_对比图')
  if (format === 'svg') {
    download(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }), `${safeName}.svg`)
    return
  }

  const viewBox = svg.viewBox.baseVal
  const width = viewBox.width || 1200
  const height = viewBox.height || 560
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法创建图片画布')
  context.scale(scale, scale)
  context.fillStyle = '#0d0f10'
  context.fillRect(0, 0, width, height)
  const image = new Image()
  const sourceUrl = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('图表图片渲染失败'))
      image.src = sourceUrl
    })
    context.drawImage(image, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG 生成失败')), 'image/png'))
    download(blob, `${safeName}.png`)
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

function serializeChart(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const viewBox = svg.viewBox.baseVal
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(viewBox.width || 1200))
  clone.setAttribute('height', String(viewBox.height || 560))
  clone.setAttribute('style', 'background:#0d0f10')
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = SVG_STYLE
  clone.insertBefore(style, clone.firstChild)
  clone.querySelectorAll('.svg-tooltip').forEach((tooltip) => tooltip.remove())
  return new XMLSerializer().serializeToString(clone)
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
