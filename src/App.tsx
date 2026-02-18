import { useEffect, useMemo, useRef, useState } from 'react'
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function renderBreakdownWindow(
  reportWindow: Window,
  simulatedDate: string,
  plusOnes: string[],
  minusOnes: string[],
): void {
  const plusList =
    plusOnes.length > 0
      ? plusOnes.map((name) => `<li>${escapeHtml(name)}</li>`).join('')
      : '<li>No +1 habits on this day.</li>'
  const minusList =
    minusOnes.length > 0
      ? minusOnes.map((name) => `<li>${escapeHtml(name)}</li>`).join('')
      : '<li>No -1 habits on this day.</li>'

  reportWindow.document.open()
  reportWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Daily Habit Score Breakdown</title>
    <style>
      body { font-family: "Segoe UI", sans-serif; margin: 18px; color: #1f2c20; background: #f3f5ef; }
      h1 { margin: 0 0 6px; font-size: 1.35rem; }
      .date { margin: 0 0 16px; color: #4f5f4e; }
      .section { background: #fff; border: 1px solid #d2dbca; border-radius: 10px; padding: 12px; margin-bottom: 12px; }
      .section h2 { margin: 0 0 10px; font-size: 1rem; }
      .plus h2 { color: #12653f; }
      .minus h2 { color: #8f261c; }
      ul { margin: 0; padding-left: 20px; }
      li { margin: 4px 0; }
    </style>
  </head>
  <body>
    <h1>Daily Score Breakdown</h1>
    <p class="date">Date: ${escapeHtml(simulatedDate)}</p>
    <section class="section plus">
      <h2>+1 Habits</h2>
      <ul>${plusList}</ul>
    </section>
    <section class="section minus">
      <h2>-1 Habits</h2>
      <ul>${minusList}</ul>
    </section>
  </body>
</html>`)
  reportWindow.document.close()
}

function App() {
  const habitApi = useMemo(() => getHabitApi(), [])
  const reportWindowRef = useRef<Window | null>(null)

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
  const plusOneHabits = useMemo(
    () => dailyBreakdown.filter((entry) => entry.delta > 0).map((entry) => entry.name),
    [dailyBreakdown],
  )
  const minusOneHabits = useMemo(
    () => dailyBreakdown.filter((entry) => entry.delta < 0).map((entry) => entry.name),
    [dailyBreakdown],
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

  const openDailyBreakdownWindow = () => {
    if (!db) {
      return
    }

    const existingWindow = reportWindowRef.current
    const reportWindow = existingWindow && !existingWindow.closed
      ? existingWindow
      : window.open('', 'habit-day-score-breakdown', 'width=540,height=700')

    if (!reportWindow) {
      setRuntimeError('Popup was blocked. Allow popups to view the daily score breakdown window.')
      return
    }

    reportWindowRef.current = reportWindow
    renderBreakdownWindow(reportWindow, db.simulatedDate, plusOneHabits, minusOneHabits)
    reportWindow.focus()
  }

  useEffect(() => {
    if (!db) {
      return
    }

    const reportWindow = reportWindowRef.current
    if (!reportWindow || reportWindow.closed) {
      return
    }

    renderBreakdownWindow(reportWindow, db.simulatedDate, plusOneHabits, minusOneHabits)
  }, [db, plusOneHabits, minusOneHabits])

  useEffect(() => {
    return () => {
      const reportWindow = reportWindowRef.current
      if (reportWindow && !reportWindow.closed) {
        reportWindow.close()
      }
    }
  }, [])

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
          <h1>Habit Scoreboard</h1>
          <p className="date-label">Current date: {db.simulatedDate}</p>
        </div>

        <div className="date-actions">
          <button
            type="button"
            className="button"
            onClick={openDailyBreakdownWindow}
          >
            Daily +/- Window
          </button>
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
    </main>
  )
}

export default App
