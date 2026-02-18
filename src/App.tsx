import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { getHabitApi } from './api'
import { computeAllHabitsView, computeDailyScoreBreakdown } from './domain/scoring'
import type { DbFile, HabitViewModel } from './shared/types'

function scoreClassName(score: number): string {
  if (score > 0) {
    return 'score score-positive'
  }

  if (score < 0) {
    return 'score score-negative'
  }

  return 'score score-neutral'
}

function formatScore(score: number): string {
  if (score > 0) {
    return `+${score}`
  }

  return `${score}`
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong.'
}

function App() {
  const habitApi = useMemo(() => getHabitApi(), [])

  const [db, setDb] = useState<DbFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [loadWarning, setLoadWarning] = useState<string | null>(null)

  const [jumpDate, setJumpDate] = useState('')
  const [newHabitName, setNewHabitName] = useState('')
  const [newHabitInterval, setNewHabitInterval] = useState('1')

  const [editingHabitId, setEditingHabitId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingInterval, setEditingInterval] = useState('1')

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const [state, warning] = await Promise.all([
          habitApi.app.getState(),
          habitApi.app.getLastLoadError(),
        ])

        if (!mounted) {
          return
        }

        setDb(state)
        setJumpDate(state.simulatedDate)
        setLoadWarning(warning)
      } catch (error) {
        if (mounted) {
          setRuntimeError(getErrorMessage(error))
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [habitApi])

  const views = useMemo<HabitViewModel[]>(() => {
    if (!db) {
      return []
    }

    return computeAllHabitsView(db)
  }, [db])

  const activeHabits = views.filter((habit) => habit.isActiveOnSimulatedDate)
  const archivedHabits = views.filter((habit) => !habit.isActiveOnSimulatedDate)
  const dailyBreakdown = useMemo(
    () => (db ? computeDailyScoreBreakdown(db, db.simulatedDate) : []),
    [db],
  )
  const dailyDeltaByHabitId = useMemo(
    () => new Map(dailyBreakdown.map((entry) => [entry.id, entry.delta])),
    [dailyBreakdown],
  )
  const dailyHabits = useMemo(
    () =>
      activeHabits
        .map((habit) => ({
          id: habit.id,
          name: habit.name,
          delta: dailyDeltaByHabitId.get(habit.id) ?? 0,
        })),
    [activeHabits, dailyDeltaByHabitId],
  )

  const runMutation = async (operation: () => Promise<DbFile>) => {
    try {
      setRuntimeError(null)
      const next = await operation()
      setDb(next)
      setJumpDate(next.simulatedDate)
    } catch (error) {
      setRuntimeError(getErrorMessage(error))
    }
  }

  const onAddHabit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const intervalDays = Number(newHabitInterval)

    await runMutation(async () => {
      const result = await habitApi.habit.add(newHabitName, intervalDays)
      setNewHabitName('')
      setNewHabitInterval('1')
      return result
    })
  }

  const onSaveEdit = async (habitId: string) => {
    if (!db) {
      return
    }

    const intervalDays = Number(editingInterval)
    await runMutation(async () => {
      const result = await habitApi.habit.edit(
        habitId,
        editingName,
        intervalDays,
        db.simulatedDate,
      )

      setEditingHabitId(null)
      return result
    })
  }

  const onReorderHabit = async (habitId: string, direction: 'up' | 'down') => {
    if (!db) {
      return
    }

    await runMutation(() => habitApi.habit.reorder(habitId, direction, db.simulatedDate))
  }

  if (loading) {
    return (
      <main className="app-shell">
        <section className="panel loading-panel">Loading habit tracker...</section>
      </main>
    )
  }

  if (!db) {
    return (
      <main className="app-shell">
        <section className="panel loading-panel">
          Failed to load application state.
          {runtimeError ? ` ${runtimeError}` : ''}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="panel top-bar">
        <div>
          <p className="eyebrow">Simulated Calendar</p>
          <h1>Multi-Interval Habit Tracker</h1>
          <p className="date-label">Current date: {db.simulatedDate}</p>
        </div>

        <div className="date-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              void runMutation(() => habitApi.clock.nextDay())
            }}
          >
            Next Day
          </button>

          <form
            className="jump-form"
            onSubmit={(event) => {
              event.preventDefault()
              void runMutation(() => habitApi.clock.jumpToDate(jumpDate))
            }}
          >
            <label htmlFor="jump-date">Jump to date</label>
            <input
              id="jump-date"
              type="date"
              value={jumpDate}
              onChange={(event) => setJumpDate(event.target.value)}
              required
            />
            <button type="submit" className="button">
              Jump
            </button>
          </form>
        </div>
      </header>

      {loadWarning ? <p className="notice warning">{loadWarning}</p> : null}
      {runtimeError ? <p className="notice error">{runtimeError}</p> : null}

      <section className="panel">
        <h2>Add Habit</h2>
        <form className="add-form" onSubmit={onAddHabit}>
          <label>
            Habit name
            <input
              type="text"
              value={newHabitName}
              onChange={(event) => setNewHabitName(event.target.value)}
              placeholder="Exercise"
              required
            />
          </label>

          <label>
            Interval (days)
            <input
              type="number"
              min={1}
              step={1}
              value={newHabitInterval}
              onChange={(event) => setNewHabitInterval(event.target.value)}
              required
            />
          </label>

          <button type="submit" className="button button-primary">
            Add Habit
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Active Habits</h2>
        {activeHabits.length === 0 ? (
          <p className="empty-state">No active habits yet.</p>
        ) : (
          <table className="habit-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Cycle</th>
                <th>Status</th>
                <th>Score</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeHabits.map((habit, index) => {
                const editing = editingHabitId === habit.id
                const canMoveUp = index > 0
                const canMoveDown = index < activeHabits.length - 1

                return (
                  <tr key={habit.id}>
                    <td>
                      {editing ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                        />
                      ) : (
                        habit.name
                      )}
                    </td>
                    <td>
                      {habit.daysElapsed} / {habit.currentIntervalDays}
                    </td>
                    <td>{habit.statusLabel}</td>
                    <td>
                      <span className={scoreClassName(habit.cumulativeScore)}>
                        {formatScore(habit.cumulativeScore)}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="button"
                        onClick={() => {
                          void onReorderHabit(habit.id, 'up')
                        }}
                        disabled={!canMoveUp}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className="button"
                        onClick={() => {
                          void onReorderHabit(habit.id, 'down')
                        }}
                        disabled={!canMoveDown}
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        className="button"
                        onClick={() => {
                          void runMutation(() =>
                            habitApi.habit.toggleCompletion(habit.id, db.simulatedDate),
                          )
                        }}
                      >
                        {habit.completedToday ? 'Undo Today' : 'Complete Today'}
                      </button>

                      {editing ? (
                        <>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={editingInterval}
                            onChange={(event) => setEditingInterval(event.target.value)}
                            className="inline-interval"
                          />
                          <button
                            type="button"
                            className="button button-primary"
                            onClick={() => {
                              void onSaveEdit(habit.id)
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="button"
                            onClick={() => setEditingHabitId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="button"
                            onClick={() => {
                              setEditingHabitId(habit.id)
                              setEditingName(habit.name)
                              setEditingInterval(String(habit.currentIntervalDays))
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button"
                            onClick={() => {
                              void runMutation(() => habitApi.habit.archive(habit.id, db.simulatedDate))
                            }}
                          >
                            Archive
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Archived Habits</h2>
        {archivedHabits.length === 0 ? (
          <p className="empty-state">No archived habits.</p>
        ) : (
          <table className="habit-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Archived at</th>
                <th>Score</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {archivedHabits.map((habit, index) => {
                const canMoveUp = index > 0
                const canMoveDown = index < archivedHabits.length - 1

                return (
                <tr key={habit.id}>
                  <td>{habit.name}</td>
                  <td>{habit.archivedAt ?? 'Unknown'}</td>
                  <td>
                    <span className={scoreClassName(habit.cumulativeScore)}>
                      {formatScore(habit.cumulativeScore)}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        void onReorderHabit(habit.id, 'up')
                      }}
                      disabled={!canMoveUp}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        void onReorderHabit(habit.id, 'down')
                      }}
                      disabled={!canMoveDown}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        void runMutation(() => habitApi.habit.restore(habit.id, db.simulatedDate))
                      }}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      className="button button-danger"
                      onClick={() => {
                        const confirmed = window.confirm(
                          `Permanently delete "${habit.name}" and all history?`,
                        )
                        if (!confirmed) {
                          return
                        }

                        void runMutation(() => habitApi.habit.deletePermanent(habit.id))
                      }}
                    >
                      Permanent Delete
                    </button>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Daily +/- Breakdown</h2>
        <p className="date-label">For {db.simulatedDate}</p>
        {dailyHabits.length === 0 ? (
          <p className="empty-state">No active habits to show.</p>
        ) : (
          <table className="habit-table">
            <thead>
              <tr>
                <th>Habit</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {dailyHabits.map((habit) => (
                <tr key={habit.id}>
                  <td>{habit.name}</td>
                  <td>
                    <span className={scoreClassName(habit.delta)}>{formatScore(habit.delta)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}

export default App
