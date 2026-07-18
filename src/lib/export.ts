import type { TelemetryPoint } from '../types'

function rows(points: TelemetryPoint[]) {
  return points.map((point, index) => ({
    序号: index + 1,
    局内时间: point.gameTime,
    局内时间秒: point.timeSeconds,
    速度_kmh: point.speed,
    OCR原始速度_kmh: point.rawSpeed ?? '',
    视频位置秒: Number(point.videoTime.toFixed(3)),
    采集方式: point.source,
    OCR置信度: point.confidence == null ? '' : Number(point.confidence.toFixed(1)),
    OCR原始时间: point.rawGameTime ?? '',
    时间已修正: point.corrected ? '是' : '否',
    速度已修正: point.speedCorrected ? '是' : '否',
    速度修正原因: point.speedCorrectionReason ?? '',
  }))
}

export async function exportCsv(points: TelemetryPoint[], fileName: string) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.json_to_sheet(rows(points))
  const csv = XLSX.utils.sheet_to_csv(sheet)
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })
  download(blob, `${safeFileName(fileName)}.csv`)
}

export async function exportXlsx(points: TelemetryPoint[], fileName: string) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows(points))
  sheet['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 13 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(workbook, sheet, '速度数据')
  const summary = XLSX.utils.aoa_to_sheet([
    ['指标', '值'],
    ['样本数', points.length],
    ['最高速度 (km/h)', points.length ? Math.max(...points.map((p) => p.speed)) : 0],
    ['平均速度 (km/h)', points.length ? points.reduce((sum, p) => sum + p.speed, 0) / points.length : 0],
  ])
  XLSX.utils.book_append_sheet(workbook, summary, '摘要')
  XLSX.writeFile(workbook, `${safeFileName(fileName)}.xlsx`)
}

export function safeFileName(value: string, fallback = 'A9_速度分析') {
  const cleaned = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100)
  return cleaned || fallback
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
