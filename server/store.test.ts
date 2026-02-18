import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { HabitStore } from './store'

async function createStore(): Promise<{ store: HabitStore; dir: string; file: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'habit-order-'))
  const file = path.join(dir, 'habits.json')
  const store = new HabitStore(file)
  await store.init()

  return { store, dir, file }
}

function getNamesInOrder(state: Awaited<ReturnType<HabitStore['getState']>>): string[] {
  return [...state.habits]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((habit) => habit.name)
}

describe('HabitStore reorder', () => {
  it('moves habits up and down within active scope', async () => {
    const { store, dir } = await createStore()

    try {
      let state = await store.addHabit('A', 1)
      state = await store.addHabit('B', 1)
      state = await store.addHabit('C', 1)

      const bId = state.habits.find((habit) => habit.name === 'B')?.id
      expect(bId).toBeTruthy()

      state = await store.reorderHabit(bId!, 'up', state.simulatedDate)
      expect(getNamesInOrder(state)).toEqual(['B', 'A', 'C'])

      state = await store.reorderHabit(bId!, 'down', state.simulatedDate)
      expect(getNamesInOrder(state)).toEqual(['A', 'B', 'C'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('migrates legacy habits without sortOrder', async () => {
    const { dir, file } = await createStore()

    try {
      const legacyDb = {
        version: 1,
        initializedAt: '2026-01-01',
        simulatedDate: '2026-01-01',
        habits: [
          {
            id: 'h1',
            name: 'Legacy One',
            createdAt: '2026-01-01',
            intervalHistory: [{ effectiveDate: '2026-01-01', intervalDays: 3 }],
            completionDates: [],
            activePeriods: [{ startDate: '2026-01-01', endDate: null }],
            status: 'active',
            archivedAt: null,
          },
          {
            id: 'h2',
            name: 'Legacy Two',
            createdAt: '2026-01-01',
            intervalHistory: [{ effectiveDate: '2026-01-01', intervalDays: 5 }],
            completionDates: [],
            activePeriods: [{ startDate: '2026-01-01', endDate: null }],
            status: 'active',
            archivedAt: null,
          },
        ],
      }

      await writeFile(file, `${JSON.stringify(legacyDb, null, 2)}\n`, 'utf8')

      const store = new HabitStore(file)
      await store.init()
      const state = await store.getState()

      expect(state.habits.map((habit) => habit.sortOrder)).toEqual([0, 1])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
