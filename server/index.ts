import express from 'express'
import path from 'node:path'
import { HabitStore } from './store'

const app = express()
app.use(express.json())

const dataFilePath = path.resolve(process.cwd(), 'data', 'habits.json')
const store = new HabitStore(dataFilePath)
await store.init()

function sendError(error: unknown, res: express.Response): void {
  const message = error instanceof Error ? error.message : 'Unknown error'

  const status =
    message.includes('not found') ||
    message.includes('Invalid') ||
    message.includes('empty') ||
    message.includes('must be')
      ? 400
      : 500

  res.status(status).json({ error: message })
}

app.get('/api/state', async (_req, res) => {
  try {
    const db = await store.getState()
    res.json(db)
  } catch (error) {
    sendError(error, res)
  }
})

app.get('/api/last-load-error', async (_req, res) => {
  try {
    const warning = await store.getLastLoadError()
    res.json({ warning })
  } catch (error) {
    sendError(error, res)
  }
})

app.post('/api/clock/next-day', async (_req, res) => {
  try {
    const db = await store.nextDay()
    res.json(db)
  } catch (error) {
    sendError(error, res)
  }
})

app.post('/api/clock/jump-to-date', async (req, res) => {
  try {
    const db = await store.jumpToDate(req.body?.date)
    res.json(db)
  } catch (error) {
    sendError(error, res)
  }
})

app.post('/api/habits', async (req, res) => {
  try {
    const db = await store.addHabit(req.body?.name, req.body?.intervalDays)
    res.json(db)
  } catch (error) {
    sendError(error, res)
  }
})

app.patch('/api/habits/:id', async (req, res) => {
  try {
    const db = await store.editHabit(
      req.params.id,
      req.body?.name,
      req.body?.intervalDays,
      req.body?.effectiveDate,
    )
    res.json(db)
  } catch (error) {
    sendError(error, res)
  }
})

app.post('/api/habits/:id/toggle-completion', async (req, res) => {
  try {
    const db = await store.toggleCompletion(req.params.id, req.body?.date)
    res.json(db)
  } catch (error) {
    sendError(error, res)
  }
})

app.post('/api/habits/:id/archive', async (req, res) => {
  try {
    const db = await store.archiveHabit(req.params.id, req.body?.date)
    res.json(db)
  } catch (error) {
    sendError(error, res)
  }
})

app.post('/api/habits/:id/restore', async (req, res) => {
  try {
    const db = await store.restoreHabit(req.params.id, req.body?.date)
    res.json(db)
  } catch (error) {
    sendError(error, res)
  }
})

app.delete('/api/habits/:id', async (req, res) => {
  try {
    const db = await store.deletePermanent(req.params.id)
    res.json(db)
  } catch (error) {
    sendError(error, res)
  }
})

const port = Number(process.env.PORT ?? 8787)
app.listen(port, () => {
  console.log(`Habit backend running at http://localhost:${port}`)
  console.log(`Persisting data to: ${dataFilePath}`)
})
