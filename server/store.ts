import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { addDaysToIsoDate, isValidIsoDate, todayIsoDate } from '../src/domain/date'
import {
  archiveHabitAtDate,
  normalizeHabit,
  restoreHabitAtDate,
  syncHabitStatusAtDate,
  toggleCompletionForDate,
  upsertIntervalAtDate,
} from '../src/domain/scoring'
import type { DbFile, Habit, ISODate } from '../src/shared/types'

function validateIntervalDays(intervalDays: number): void {
  if (!Number.isInteger(intervalDays) || intervalDays < 1) {
    throw new Error('Interval must be an integer greater than or equal to 1')
  }
}

function normalizeName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Habit name cannot be empty')
  }

  return trimmed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function parseIntervalChange(raw: unknown): Habit['intervalHistory'][number] {
  if (!isRecord(raw)) {
    throw new Error('Invalid interval change')
  }

  if (typeof raw.effectiveDate !== 'string' || !isValidIsoDate(raw.effectiveDate)) {
    throw new Error('Invalid interval effectiveDate')
  }

  const intervalDays = raw.intervalDays
  if (typeof intervalDays !== 'number' || !Number.isInteger(intervalDays) || intervalDays < 1) {
    throw new Error('Invalid intervalDays')
  }

  return {
    effectiveDate: raw.effectiveDate,
    intervalDays,
  }
}

function parseActivePeriod(raw: unknown): Habit['activePeriods'][number] {
  if (!isRecord(raw)) {
    throw new Error('Invalid active period')
  }

  if (typeof raw.startDate !== 'string' || !isValidIsoDate(raw.startDate)) {
    throw new Error('Invalid active period startDate')
  }

  if (raw.endDate !== null && (typeof raw.endDate !== 'string' || !isValidIsoDate(raw.endDate))) {
    throw new Error('Invalid active period endDate')
  }

  return {
    startDate: raw.startDate,
    endDate: raw.endDate,
  }
}

function parseHabit(raw: unknown): Habit {
  if (!isRecord(raw)) {
    throw new Error('Invalid habit entry')
  }

  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    throw new Error('Invalid habit id')
  }

  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
    throw new Error('Invalid habit name')
  }

  if (typeof raw.createdAt !== 'string' || !isValidIsoDate(raw.createdAt)) {
    throw new Error('Invalid habit createdAt')
  }

  if (!Array.isArray(raw.intervalHistory) || raw.intervalHistory.length === 0) {
    throw new Error('Invalid habit intervalHistory')
  }

  if (!Array.isArray(raw.completionDates)) {
    throw new Error('Invalid habit completionDates')
  }

  if (!raw.completionDates.every((date) => typeof date === 'string' && isValidIsoDate(date))) {
    throw new Error('Invalid habit completion date')
  }

  if (!Array.isArray(raw.activePeriods) || raw.activePeriods.length === 0) {
    throw new Error('Invalid habit activePeriods')
  }

  if (raw.status !== 'active' && raw.status !== 'archived') {
    throw new Error('Invalid habit status')
  }

  if (raw.archivedAt !== null && (typeof raw.archivedAt !== 'string' || !isValidIsoDate(raw.archivedAt))) {
    throw new Error('Invalid habit archivedAt')
  }

  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    intervalHistory: raw.intervalHistory.map(parseIntervalChange),
    completionDates: raw.completionDates,
    activePeriods: raw.activePeriods.map(parseActivePeriod),
    status: raw.status,
    archivedAt: raw.archivedAt,
  }
}

function parseDb(raw: unknown): DbFile {
  if (!isRecord(raw)) {
    throw new Error('Database payload is not an object')
  }

  if (raw.version !== 1) {
    throw new Error('Unsupported database version')
  }

  if (typeof raw.initializedAt !== 'string' || !isValidIsoDate(raw.initializedAt)) {
    throw new Error('Invalid initializedAt')
  }

  if (typeof raw.simulatedDate !== 'string' || !isValidIsoDate(raw.simulatedDate)) {
    throw new Error('Invalid simulatedDate')
  }

  if (!Array.isArray(raw.habits)) {
    throw new Error('Invalid habits array')
  }

  return {
    version: 1,
    initializedAt: raw.initializedAt,
    simulatedDate: raw.simulatedDate,
    habits: raw.habits.map(parseHabit),
  }
}

function createDefaultDb(date: ISODate): DbFile {
  return {
    version: 1,
    initializedAt: date,
    simulatedDate: date,
    habits: [],
  }
}

function normalizeDb(rawDb: DbFile): DbFile {
  return {
    ...rawDb,
    habits: rawDb.habits.map((habit) => syncHabitStatusAtDate(normalizeHabit(habit), rawDb.simulatedDate)),
  }
}

function cloneDb(db: DbFile): DbFile {
  return structuredClone(db)
}

async function writeDbFileAtomic(filePath: string, db: DbFile): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const payload = `${JSON.stringify(db, null, 2)}\n`

  await writeFile(tempPath, payload, 'utf8')
  await rename(tempPath, filePath)
}

export class HabitStore {
  private readonly dbFilePath: string
  private db: DbFile | null = null
  private lastLoadError: string | null = null
  private lock: Promise<void> = Promise.resolve()

  constructor(dbFilePath: string) {
    this.dbFilePath = dbFilePath
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.lock.then(operation, operation)
    this.lock = next.then(
      () => undefined,
      () => undefined,
    )

    return next
  }

  private ensureDb(): DbFile {
    if (!this.db) {
      throw new Error('Store has not been initialized')
    }

    return this.db
  }

  private syncStatuses(): void {
    const db = this.ensureDb()
    db.habits = db.habits.map((habit) => syncHabitStatusAtDate(habit, db.simulatedDate))
  }

  private assertIsoDate(date: string, fieldName: string): asserts date is ISODate {
    if (!isValidIsoDate(date)) {
      throw new Error(`Invalid ${fieldName}: ${date}`)
    }
  }

  private findHabitIndex(id: string): number {
    return this.ensureDb().habits.findIndex((habit) => habit.id === id)
  }

  private async commit(): Promise<DbFile> {
    this.syncStatuses()
    const db = this.ensureDb()
    await writeDbFileAtomic(this.dbFilePath, db)
    return cloneDb(db)
  }

  async init(): Promise<void> {
    await this.withLock(async () => {
      await mkdir(path.dirname(this.dbFilePath), { recursive: true })

      try {
        const raw = await readFile(this.dbFilePath, 'utf8')
        const parsed = parseDb(JSON.parse(raw))
        this.db = normalizeDb(parsed)
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException

        if (nodeError.code === 'ENOENT') {
          this.db = createDefaultDb(todayIsoDate())
          await this.commit()
          return
        }

        let existing = ''
        try {
          existing = await readFile(this.dbFilePath, 'utf8')
        } catch {
          // no-op
        }

        const backupPath = `${this.dbFilePath}.corrupt-${Date.now()}`
        if (existing) {
          try {
            await rename(this.dbFilePath, backupPath)
          } catch {
            // best-effort backup
          }
        }

        this.db = createDefaultDb(todayIsoDate())
        this.lastLoadError = `Database file was invalid and has been reset. Backup: ${backupPath}`
        await this.commit()
      }
    })
  }

  async getState(): Promise<DbFile> {
    return this.withLock(async () => cloneDb(this.ensureDb()))
  }

  async getLastLoadError(): Promise<string | null> {
    return this.withLock(async () => this.lastLoadError)
  }

  async nextDay(): Promise<DbFile> {
    return this.withLock(async () => {
      const db = this.ensureDb()
      db.simulatedDate = addDaysToIsoDate(db.simulatedDate, 1)
      return this.commit()
    })
  }

  async jumpToDate(date: string): Promise<DbFile> {
    this.assertIsoDate(date, 'date')

    return this.withLock(async () => {
      const db = this.ensureDb()
      db.simulatedDate = date
      return this.commit()
    })
  }

  async addHabit(name: string, intervalDays: number): Promise<DbFile> {
    validateIntervalDays(intervalDays)
    const normalizedName = normalizeName(name)

    return this.withLock(async () => {
      const db = this.ensureDb()
      const today = db.simulatedDate

      const habit: Habit = {
        id: randomUUID(),
        name: normalizedName,
        createdAt: today,
        intervalHistory: [{ effectiveDate: today, intervalDays }],
        completionDates: [],
        activePeriods: [{ startDate: today, endDate: null }],
        status: 'active',
        archivedAt: null,
      }

      db.habits.push(habit)
      return this.commit()
    })
  }

  async editHabit(id: string, name: string, intervalDays: number, effectiveDate: string): Promise<DbFile> {
    validateIntervalDays(intervalDays)
    this.assertIsoDate(effectiveDate, 'effectiveDate')
    const normalizedName = normalizeName(name)

    return this.withLock(async () => {
      const habitIndex = this.findHabitIndex(id)
      if (habitIndex < 0) {
        throw new Error('Habit not found')
      }

      const edited = upsertIntervalAtDate(this.ensureDb().habits[habitIndex], effectiveDate, intervalDays)
      this.ensureDb().habits[habitIndex] = {
        ...edited,
        name: normalizedName,
      }

      return this.commit()
    })
  }

  async toggleCompletion(id: string, date: string): Promise<DbFile> {
    this.assertIsoDate(date, 'date')

    return this.withLock(async () => {
      const habitIndex = this.findHabitIndex(id)
      if (habitIndex < 0) {
        throw new Error('Habit not found')
      }

      this.ensureDb().habits[habitIndex] = toggleCompletionForDate(this.ensureDb().habits[habitIndex], date)
      return this.commit()
    })
  }

  async archiveHabit(id: string, date: string): Promise<DbFile> {
    this.assertIsoDate(date, 'date')

    return this.withLock(async () => {
      const habitIndex = this.findHabitIndex(id)
      if (habitIndex < 0) {
        throw new Error('Habit not found')
      }

      this.ensureDb().habits[habitIndex] = archiveHabitAtDate(this.ensureDb().habits[habitIndex], date)
      return this.commit()
    })
  }

  async restoreHabit(id: string, date: string): Promise<DbFile> {
    this.assertIsoDate(date, 'date')

    return this.withLock(async () => {
      const habitIndex = this.findHabitIndex(id)
      if (habitIndex < 0) {
        throw new Error('Habit not found')
      }

      this.ensureDb().habits[habitIndex] = restoreHabitAtDate(this.ensureDb().habits[habitIndex], date)
      return this.commit()
    })
  }

  async deletePermanent(id: string): Promise<DbFile> {
    return this.withLock(async () => {
      const db = this.ensureDb()
      const countBefore = db.habits.length
      db.habits = db.habits.filter((habit) => habit.id !== id)

      if (db.habits.length === countBefore) {
        throw new Error('Habit not found')
      }

      return this.commit()
    })
  }
}
