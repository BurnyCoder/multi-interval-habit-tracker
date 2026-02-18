import type { DbFile, ISODate } from './types'

export const IPC_CHANNELS = {
  appGetState: 'app.getState',
  appGetLastLoadError: 'app.getLastLoadError',
  clockNextDay: 'clock.nextDay',
  clockJumpToDate: 'clock.jumpToDate',
  habitAdd: 'habit.add',
  habitEdit: 'habit.edit',
  habitToggleCompletion: 'habit.toggleCompletion',
  habitArchive: 'habit.archive',
  habitRestore: 'habit.restore',
  habitDeletePermanent: 'habit.deletePermanent',
  habitReorder: 'habit.reorder',
} as const

export interface HabitApi {
  app: {
    getState: () => Promise<DbFile>
    getLastLoadError: () => Promise<string | null>
  }
  clock: {
    nextDay: () => Promise<DbFile>
    jumpToDate: (date: ISODate) => Promise<DbFile>
  }
  habit: {
    add: (name: string, intervalDays: number) => Promise<DbFile>
    edit: (id: string, name: string, intervalDays: number, effectiveDate: ISODate) => Promise<DbFile>
    toggleCompletion: (id: string, date: ISODate) => Promise<DbFile>
    archive: (id: string, date: ISODate) => Promise<DbFile>
    restore: (id: string, date: ISODate) => Promise<DbFile>
    deletePermanent: (id: string) => Promise<DbFile>
    reorder: (id: string, direction: 'up' | 'down', date: ISODate) => Promise<DbFile>
  }
}
