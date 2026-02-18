import {
  addDaysToIsoDate,
  compareIsoDates,
  diffIsoDates,
  iterateIsoDatesInclusive,
  minIsoDate,
} from './date'
import type {
  ActivePeriod,
  DbFile,
  Habit,
  HabitStatusKind,
  HabitViewModel,
  ISODate,
  IntervalChange,
} from '../shared/types'

function assertIntervalDays(intervalDays: number): void {
  if (!Number.isInteger(intervalDays) || intervalDays < 1) {
    throw new Error('Interval must be an integer greater than or equal to 1')
  }
}

export function normalizeIntervalHistory(intervalHistory: IntervalChange[]): IntervalChange[] {
  if (intervalHistory.length === 0) {
    throw new Error('Interval history cannot be empty')
  }

  const byDate = new Map<ISODate, number>()
  for (const change of intervalHistory) {
    assertIntervalDays(change.intervalDays)
    byDate.set(change.effectiveDate, change.intervalDays)
  }

  return [...byDate.entries()]
    .sort((a, b) => compareIsoDates(a[0], b[0]))
    .map(([effectiveDate, intervalDays]) => ({ effectiveDate, intervalDays }))
}

export function normalizeCompletionDates(completionDates: ISODate[]): ISODate[] {
  return [...new Set(completionDates)].sort(compareIsoDates)
}

export function normalizeActivePeriods(activePeriods: ActivePeriod[]): ActivePeriod[] {
  if (activePeriods.length === 0) {
    return []
  }

  const prepared = activePeriods
    .map((period) => {
      if (period.endDate !== null && compareIsoDates(period.endDate, period.startDate) < 0) {
        return {
          startDate: period.startDate,
          endDate: period.startDate,
        }
      }

      return {
        startDate: period.startDate,
        endDate: period.endDate,
      }
    })
    .sort((a, b) => compareIsoDates(a.startDate, b.startDate))

  const merged: ActivePeriod[] = []
  for (const current of prepared) {
    const previous = merged[merged.length - 1]
    if (!previous) {
      merged.push(current)
      continue
    }

    if (previous.endDate === null) {
      continue
    }

    const previousAdjacentOrAfter = addDaysToIsoDate(previous.endDate, 1)
    if (compareIsoDates(current.startDate, previousAdjacentOrAfter) <= 0) {
      if (current.endDate === null || compareIsoDates(current.endDate, previous.endDate) > 0) {
        previous.endDate = current.endDate
      }
      continue
    }

    merged.push(current)
  }

  return merged
}

export function normalizeHabit(habit: Habit): Habit {
  const sortOrder = Number.isInteger(habit.sortOrder) && habit.sortOrder >= 0 ? habit.sortOrder : 0

  return {
    ...habit,
    name: habit.name.trim(),
    sortOrder,
    intervalHistory: normalizeIntervalHistory(habit.intervalHistory),
    completionDates: normalizeCompletionDates(habit.completionDates),
    activePeriods: normalizeActivePeriods(habit.activePeriods),
  }
}

function isDateWithinPeriod(date: ISODate, period: ActivePeriod): boolean {
  if (compareIsoDates(date, period.startDate) < 0) {
    return false
  }

  if (period.endDate === null) {
    return true
  }

  return compareIsoDates(date, period.endDate) <= 0
}

export function isHabitActiveOnDate(habit: Habit, date: ISODate): boolean {
  return habit.activePeriods.some((period) => isDateWithinPeriod(date, period))
}

function getLastActiveDateOnOrBefore(habit: Habit, date: ISODate): ISODate | null {
  let latest: ISODate | null = null

  for (const period of habit.activePeriods) {
    if (compareIsoDates(period.startDate, date) > 0) {
      break
    }

    const candidate = period.endDate === null || compareIsoDates(period.endDate, date) > 0 ? date : period.endDate
    if (latest === null || compareIsoDates(candidate, latest) > 0) {
      latest = candidate
    }
  }

  return latest
}

function getArchivedAtDate(habit: Habit, date: ISODate): ISODate | null {
  let latest: ISODate | null = null
  for (const period of habit.activePeriods) {
    if (period.endDate === null) {
      continue
    }

    if (compareIsoDates(period.endDate, date) <= 0) {
      if (latest === null || compareIsoDates(period.endDate, latest) > 0) {
        latest = period.endDate
      }
    }
  }

  return latest
}

export function syncHabitStatusAtDate(habit: Habit, date: ISODate): Habit {
  const normalized = normalizeHabit(habit)
  const active = isHabitActiveOnDate(normalized, date)

  return {
    ...normalized,
    status: active ? 'active' : 'archived',
    archivedAt: active ? null : getArchivedAtDate(normalized, date),
  }
}

function getScoringDateForHabit(habit: Habit, simulatedDate: ISODate): ISODate {
  if (isHabitActiveOnDate(habit, simulatedDate)) {
    return simulatedDate
  }

  return getLastActiveDateOnOrBefore(habit, simulatedDate) ?? simulatedDate
}

export function getIntervalAtDate(intervalHistory: IntervalChange[], date: ISODate): number {
  const normalized = normalizeIntervalHistory(intervalHistory)
  let selected = normalized[0]

  for (const change of normalized) {
    if (compareIsoDates(change.effectiveDate, date) <= 0) {
      selected = change
    } else {
      break
    }
  }

  return selected.intervalDays
}

function buildStatusLabel(
  kind: HabitStatusKind,
  daysElapsed: number,
  intervalDays: number,
  remainingDays: number,
  overdueDays: number,
): string {
  if (kind === 'completed') {
    return `Completed today (0 / ${intervalDays})`
  }

  if (kind === 'waiting') {
    return `Waiting (${daysElapsed} / ${intervalDays}, ${remainingDays} day${remainingDays === 1 ? '' : 's'} remaining)`
  }

  if (kind === 'overdue') {
    return `Overdue (${daysElapsed} / ${intervalDays}, ${overdueDays} day${overdueDays === 1 ? '' : 's'} late)`
  }

  return `Archived (frozen at ${daysElapsed} / ${intervalDays})`
}

export function computeHabitView(rawHabit: Habit, simulatedDate: ISODate): HabitViewModel {
  const habit = normalizeHabit(rawHabit)
  const activeOnSimulatedDate = isHabitActiveOnDate(habit, simulatedDate)
  const scoringDate = getScoringDateForHabit(habit, simulatedDate)

  const completionSet = new Set(
    habit.completionDates.filter((date) => compareIsoDates(date, scoringDate) <= 0),
  )

  let cumulativeScore = 0
  let lastResetAtScoringDate = scoringDate
  let intervalAtScoringDate = getIntervalAtDate(habit.intervalHistory, scoringDate)
  let completedOnScoringDate = completionSet.has(scoringDate)
  let capturedScoringDate = false

  for (const period of habit.activePeriods) {
    if (compareIsoDates(period.startDate, scoringDate) > 0) {
      break
    }

    const periodEnd = period.endDate === null ? scoringDate : minIsoDate(period.endDate, scoringDate)
    if (compareIsoDates(periodEnd, period.startDate) < 0) {
      continue
    }

    let lastResetDate = period.startDate

    for (const day of iterateIsoDatesInclusive(period.startDate, periodEnd)) {
      const intervalDays = getIntervalAtDate(habit.intervalHistory, day)
      const completed = completionSet.has(day)
      const daysElapsed = diffIsoDates(lastResetDate, day)

      if (completed) {
        cumulativeScore += 1
        lastResetDate = day
      } else if (daysElapsed > intervalDays) {
        cumulativeScore -= 1
      }

      if (day === scoringDate) {
        capturedScoringDate = true
        lastResetAtScoringDate = lastResetDate
        intervalAtScoringDate = intervalDays
        completedOnScoringDate = completed
      }
    }
  }

  if (!capturedScoringDate) {
    lastResetAtScoringDate = scoringDate
    intervalAtScoringDate = getIntervalAtDate(habit.intervalHistory, scoringDate)
    completedOnScoringDate = completionSet.has(scoringDate)
  }

  const completedToday = activeOnSimulatedDate && habit.completionDates.includes(simulatedDate)
  const daysElapsed = diffIsoDates(lastResetAtScoringDate, scoringDate)
  const overdueDays = Math.max(daysElapsed - intervalAtScoringDate, 0)
  const remainingDays = Math.max(intervalAtScoringDate - daysElapsed, 0)

  let statusKind: HabitStatusKind
  if (!activeOnSimulatedDate) {
    statusKind = 'archived'
  } else if (completedToday || completedOnScoringDate) {
    statusKind = 'completed'
  } else if (daysElapsed <= intervalAtScoringDate) {
    statusKind = 'waiting'
  } else {
    statusKind = 'overdue'
  }

  return {
    id: habit.id,
    name: habit.name,
    currentIntervalDays: intervalAtScoringDate,
    daysElapsed,
    remainingDays,
    overdueDays,
    completedToday,
    cumulativeScore,
    statusKind,
    statusLabel: buildStatusLabel(
      statusKind,
      daysElapsed,
      intervalAtScoringDate,
      remainingDays,
      overdueDays,
    ),
    isActiveOnSimulatedDate: activeOnSimulatedDate,
    archivedAt: activeOnSimulatedDate ? null : getArchivedAtDate(habit, simulatedDate),
    createdAt: habit.createdAt,
  }
}

export function computeAllHabitsView(dbFile: DbFile): HabitViewModel[] {
  const sortOrderById = new Map(dbFile.habits.map((habit) => [habit.id, habit.sortOrder]))

  return dbFile.habits
    .map((habit) => computeHabitView(habit, dbFile.simulatedDate))
    .sort((a, b) => {
      const activeRank = Number(b.isActiveOnSimulatedDate) - Number(a.isActiveOnSimulatedDate)
      if (activeRank !== 0) {
        return activeRank
      }

      const orderA = sortOrderById.get(a.id) ?? 0
      const orderB = sortOrderById.get(b.id) ?? 0
      const orderRank = orderA - orderB
      if (orderRank !== 0) {
        return orderRank
      }

      return a.name.localeCompare(b.name)
    })
}

export function toggleCompletionForDate(rawHabit: Habit, date: ISODate): Habit {
  const habit = normalizeHabit(rawHabit)
  if (!isHabitActiveOnDate(habit, date)) {
    throw new Error('Habit is archived on the selected date and cannot be checked off')
  }

  const completionDates = new Set(habit.completionDates)
  if (completionDates.has(date)) {
    completionDates.delete(date)
  } else {
    completionDates.add(date)
  }

  return {
    ...habit,
    completionDates: normalizeCompletionDates([...completionDates]),
  }
}

export function archiveHabitAtDate(rawHabit: Habit, date: ISODate): Habit {
  const habit = normalizeHabit(rawHabit)
  if (!isHabitActiveOnDate(habit, date)) {
    return syncHabitStatusAtDate(habit, date)
  }

  const nextPeriods = habit.activePeriods.map((period) => {
    if (!isDateWithinPeriod(date, period)) {
      return period
    }

    return {
      ...period,
      endDate: date,
    }
  })

  return syncHabitStatusAtDate(
    {
      ...habit,
      activePeriods: normalizeActivePeriods(nextPeriods),
    },
    date,
  )
}

export function restoreHabitAtDate(rawHabit: Habit, date: ISODate): Habit {
  const habit = normalizeHabit(rawHabit)
  if (isHabitActiveOnDate(habit, date)) {
    return syncHabitStatusAtDate(habit, date)
  }

  const nextPeriods = normalizeActivePeriods([
    ...habit.activePeriods,
    {
      startDate: date,
      endDate: null,
    },
  ])

  return syncHabitStatusAtDate(
    {
      ...habit,
      activePeriods: nextPeriods,
    },
    date,
  )
}

export function upsertIntervalAtDate(rawHabit: Habit, date: ISODate, intervalDays: number): Habit {
  assertIntervalDays(intervalDays)
  const habit = normalizeHabit(rawHabit)

  const nextHistory = [...habit.intervalHistory]
  const existingIndex = nextHistory.findIndex((change) => change.effectiveDate === date)
  if (existingIndex >= 0) {
    nextHistory[existingIndex] = {
      effectiveDate: date,
      intervalDays,
    }
  } else {
    nextHistory.push({
      effectiveDate: date,
      intervalDays,
    })
  }

  return {
    ...habit,
    intervalHistory: normalizeIntervalHistory(nextHistory),
  }
}
