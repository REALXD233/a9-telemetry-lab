export function parseGameTime(value: string): number | null {
  const normalized = value.trim().replace(/[，,]/g, '.').replace(/[^\d:.]/g, '')
  const parts = normalized.split(':')
  if (!parts.length || parts.some((part) => part === '')) return null
  const numbers = parts.map(Number)
  if (numbers.some(Number.isNaN)) return null
  if (numbers.length === 3) return numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
  if (numbers.length === 2) return numbers[0] * 60 + numbers[1]
  if (numbers.length === 1) return numbers[0]
  return null
}

export function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00.000'
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export function normalizeGameTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`
}
