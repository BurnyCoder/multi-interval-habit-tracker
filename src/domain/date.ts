import { addDays, differenceInCalendarDays, format } from 'date-fns'
import type { ISODate } from '../shared/types'

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export function isValidIsoDate(value: string): value is ISODate {
  if (!ISO_DATE_REGEX.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  return Number.isFinite(parsed.getTime()) && format(parsed, 'yyyy-MM-dd') === value
}

export function parseIsoDate(value: ISODate): Date {
  if (!isValidIsoDate(value)) {
    throw new Error(`Invalid ISO date: ${value}`)
  }

  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatIsoDate(value: Date): ISODate {
  return format(value, 'yyyy-MM-dd')
}

export function todayIsoDate(): ISODate {
  return formatIsoDate(new Date())
}

export function addDaysToIsoDate(value: ISODate, amount: number): ISODate {
  return formatIsoDate(addDays(parseIsoDate(value), amount))
}

export function diffIsoDates(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(parseIsoDate(to), parseIsoDate(from))
}

export function compareIsoDates(a: ISODate, b: ISODate): number {
  if (a === b) {
    return 0
  }

  return a < b ? -1 : 1
}

export function minIsoDate(a: ISODate, b: ISODate): ISODate {
  return compareIsoDates(a, b) <= 0 ? a : b
}

export function maxIsoDate(a: ISODate, b: ISODate): ISODate {
  return compareIsoDates(a, b) >= 0 ? a : b
}

export function* iterateIsoDatesInclusive(start: ISODate, end: ISODate): Generator<ISODate> {
  if (compareIsoDates(start, end) > 0) {
    return
  }

  let cursor = start
  while (compareIsoDates(cursor, end) <= 0) {
    yield cursor
    cursor = addDaysToIsoDate(cursor, 1)
  }
}
