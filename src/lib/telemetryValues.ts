import type { DataPreference, TelemetryPoint } from '../types'
import { parseGameTime } from './time'

export interface TelemetryValues {
  speed: number
  gameTime: string
  timeSeconds: number
}

export function correctedValues(point: TelemetryPoint): TelemetryValues {
  return { speed: point.speed, gameTime: point.gameTime, timeSeconds: point.timeSeconds }
}

export function rawValues(point: TelemetryPoint): TelemetryValues {
  const parsedRawTime = parseGameTime(point.rawGameTime ?? '')
  return {
    speed: point.rawSpeed ?? point.speed,
    gameTime: point.rawGameTime?.trim() || point.gameTime,
    timeSeconds: parsedRawTime ?? point.timeSeconds,
  }
}

export function preferredValues(point: TelemetryPoint, preference: DataPreference): TelemetryValues {
  return preference === 'raw' ? rawValues(point) : correctedValues(point)
}

export function hasRawDifference(point: TelemetryPoint) {
  const raw = rawValues(point)
  return raw.speed !== point.speed || Math.abs(raw.timeSeconds - point.timeSeconds) > .0005
}
