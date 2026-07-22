import type { DataPreference, TelemetryPoint } from '../types'
import { correctedValues, preferredValues, rawValues } from './telemetryValues'

function rows(points: TelemetryPoint[], preference: DataPreference) {
  return points.map((point, index) => {
    const preferred = preferredValues(point, preference)
    const raw = rawValues(point)
    const corrected = correctedValues(point)
    return {
    序号: index + 1,
    导出偏好: preference === 'corrected' ? '修正后数据' : '原始 OCR 数据',
    局内时间: preferred.gameTime,
    局内时间秒: preferred.timeSeconds,
    速度_kmh: preferred.speed,
    OCR原始时间: raw.gameTime,
    OCR原始时间秒: raw.timeSeconds,
    OCR原始速度_kmh: raw.speed,
    修正后时间: corrected.gameTime,
    修正后时间秒: corrected.timeSeconds,
    修正后速度_kmh: corrected.speed,
    视频位置秒: Number(point.videoTime.toFixed(3)),
    采集方式: point.source,
    手动真值锁定: point.locked || point.source === '手动' ? '是' : '否',
    OCR置信度: point.confidence == null ? '' : Number(point.confidence.toFixed(1)),
    时间已修正: point.corrected ? '是' : '否',
    速度已修正: point.speedCorrected ? '是' : '否',
    速度修正原因: point.speedCorrectionReason ?? '',
    }
  })
}

export async function exportCsv(points: TelemetryPoint[], fileName: string, preference: DataPreference = 'corrected') {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.json_to_sheet(rows(points, preference))
  const csv = XLSX.utils.sheet_to_csv(sheet)
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })
  download(blob, `${safeFileName(fileName)}.csv`)
}

export async function exportXlsx(points: TelemetryPoint[], fileName: string, preference: DataPreference = 'corrected') {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows(points, preference))
  sheet['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 13 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(workbook, sheet, '速度数据')
  const summary = XLSX.utils.aoa_to_sheet([
    ['指标', '值'],
    ['样本数', points.length],
    ['导出偏好', preference === 'corrected' ? '修正后数据' : '原始 OCR 数据'],
    ['最高速度 (km/h)', points.length ? Math.max(...points.map((p) => preferredValues(p, preference).speed)) : 0],
    ['平均速度 (km/h)', points.length ? points.reduce((sum, p) => sum + preferredValues(p, preference).speed, 0) / points.length : 0],
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
