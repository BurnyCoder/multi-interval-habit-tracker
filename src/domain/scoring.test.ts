import { describe, expect, it } from 'vitest'
import { addDaysToIsoDate } from './date'
import {
  computeAllHabitsView,
  computeHabitView,
  restoreHabitAtDate,
  toggleCompletionForDate,
} from './scoring'
import type { DbFile, Habit } from '../shared/types'

function buildHabit(partial: Partial<Habit> = {}): Habit {
  return {
    id: 'habit-1',
    name: 'Exercise',
    sortOrder: 0,
    createdAt: '2026-03-01',
    intervalHistory: [{ effectiveDate: '2026-03-01', intervalDays: 5 }],
    completionDates: [],
    activePeriods: [{ startDate: '2026-03-01', endDate: null }],
    status: 'active',
    archivedAt: null,
    ...partial,
  }
}

describe('scoring engine', () => {
  it('awards +1 for on-time completion and resets cycle', () => {
    const habit = buildHabit({ completionDates: ['2026-03-04'] }) // Day 3
    const view = computeHabitView(habit, '2026-03-04')

    expect(view.cumulativeScore).toBe(1)
    expect(view.daysElapsed).toBe(0)
    expect(view.statusKind).toBe('completed')
  })

  it('awards +1 on the interval boundary with no overdue penalty', () => {
    const habit = buildHabit({ completionDates: ['2026-03-06'] }) // Day 5
    const view = computeHabitView(habit, '2026-03-06')

    expect(view.cumulativeScore).toBe(1)
    expect(view.overdueDays).toBe(0)
  })

  it('accumulates -1 per overdue day when not completed', () => {
    const habit = buildHabit()
    const view = computeHabitView(habit, '2026-03-10') // Day 9

    expect(view.cumulativeScore).toBe(-4)
    expect(view.overdueDays).toBe(4)
  })

  it('excludes completion day from overdue penalties when completed late', () => {
    const habit = buildHabit({ completionDates: ['2026-03-08'] }) // Day 7
    const view = computeHabitView(habit, '2026-03-08')

    expect(view.cumulativeScore).toBe(0)
  })

  it('removes today penalty when user completes on an overdue day', () => {
    const noCompletion = computeHabitView(buildHabit(), '2026-03-08')
    const withCompletion = computeHabitView(
      buildHabit({ completionDates: ['2026-03-08'] }),
      '2026-03-08',
    )

    expect(noCompletion.cumulativeScore).toBe(-2)
    expect(withCompletion.cumulativeScore).toBe(0)
  })

  it('matches jump-ahead and repeated next-day scoring', () => {
    const habit = buildHabit()
    const jumped = computeHabitView(habit, '2026-03-10')

    let cursor = '2026-03-01'
    let latestScore = computeHabitView(habit, cursor).cumulativeScore
    while (cursor !== '2026-03-10') {
      cursor = addDaysToIsoDate(cursor, 1)
      latestScore = computeHabitView(habit, cursor).cumulativeScore
    }

    expect(latestScore).toBe(jumped.cumulativeScore)
  })

  it('ignores completion dates in the future of the current simulated date', () => {
    const habit = buildHabit({ completionDates: ['2026-03-09'] })
    const view = computeHabitView(habit, '2026-03-05')

    expect(view.cumulativeScore).toBe(0)
    expect(view.completedToday).toBe(false)
  })

  it('supports same-day toggle and undo', () => {
    const original = buildHabit()
    const completed = toggleCompletionForDate(original, '2026-03-04')
    const undone = toggleCompletionForDate(completed, '2026-03-04')

    expect(computeHabitView(completed, '2026-03-04').completedToday).toBe(true)
    expect(computeHabitView(undone, '2026-03-04').completedToday).toBe(false)
    expect(computeHabitView(undone, '2026-03-04').cumulativeScore).toBe(
      computeHabitView(original, '2026-03-04').cumulativeScore,
    )
  })

  it('applies interval edits immediately from the effective date', () => {
    const habit = buildHabit({
      createdAt: '2026-04-01',
      intervalHistory: [
        { effectiveDate: '2026-04-01', intervalDays: 5 },
        { effectiveDate: '2026-04-10', intervalDays: 10 },
      ],
      activePeriods: [{ startDate: '2026-04-01', endDate: null }],
    })

    const view = computeHabitView(habit, '2026-04-12')
    expect(view.cumulativeScore).toBe(-4)
  })

  it('freezes archived habit score after archive date', () => {
    const habit = buildHabit({
      createdAt: '2026-05-01',
      intervalHistory: [{ effectiveDate: '2026-05-01', intervalDays: 2 }],
      activePeriods: [{ startDate: '2026-05-01', endDate: '2026-05-03' }],
      status: 'archived',
      archivedAt: '2026-05-03',
    })

    const view = computeHabitView(habit, '2026-05-10')
    expect(view.cumulativeScore).toBe(0)
    expect(view.isActiveOnSimulatedDate).toBe(false)
  })

  it('restores habit as a fresh cycle from restore date', () => {
    const archived = buildHabit({
      createdAt: '2026-05-01',
      intervalHistory: [{ effectiveDate: '2026-05-01', intervalDays: 2 }],
      activePeriods: [{ startDate: '2026-05-01', endDate: '2026-05-03' }],
      status: 'archived',
      archivedAt: '2026-05-03',
    })

    const restored = restoreHabitAtDate(archived, '2026-05-10')
    const view = computeHabitView(restored, '2026-05-12')

    expect(view.cumulativeScore).toBe(0)
    expect(view.daysElapsed).toBe(2)
    expect(view.isActiveOnSimulatedDate).toBe(true)
  })

  it('uses sortOrder when listing habits', () => {
    const db: DbFile = {
      version: 1,
      initializedAt: '2026-03-01',
      simulatedDate: '2026-03-01',
      habits: [
        buildHabit({ id: 'b', name: 'B', sortOrder: 1 }),
        buildHabit({ id: 'a', name: 'A', sortOrder: 0 }),
      ],
    }

    const views = computeAllHabitsView(db)
    expect(views.map((view) => view.id)).toEqual(['a', 'b'])
  })
})
