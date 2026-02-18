export type ISODate = string

export interface IntervalChange {
  effectiveDate: ISODate
  intervalDays: number
}

export interface ActivePeriod {
  startDate: ISODate
  endDate: ISODate | null
}

export type HabitStatus = 'active' | 'archived'

export interface Habit {
  id: string
  name: string
  sortOrder: number
  createdAt: ISODate
  intervalHistory: IntervalChange[]
  completionDates: ISODate[]
  activePeriods: ActivePeriod[]
  status: HabitStatus
  archivedAt: ISODate | null
}

export interface DbFile {
  version: 1
  initializedAt: ISODate
  simulatedDate: ISODate
  habits: Habit[]
}

export type HabitStatusKind = 'completed' | 'waiting' | 'overdue' | 'archived'

export interface HabitViewModel {
  id: string
  name: string
  currentIntervalDays: number
  daysElapsed: number
  remainingDays: number
  overdueDays: number
  completedToday: boolean
  cumulativeScore: number
  statusKind: HabitStatusKind
  statusLabel: string
  isActiveOnSimulatedDate: boolean
  archivedAt: ISODate | null
  createdAt: ISODate
}
