# Habit Scoreboard (Browser UI + Local Backend)

Additional functionality to complement [Habitica](https://habitica.com/) — a browser-based habit tracker that persists data in your project folder via a local backend service.

## Persistence location

- Data is stored on disk at: `data/habits.json`
- The backend creates this file automatically if it does not exist.

## What it does

- Create habits with a custom name and interval in days.
- Check off habits for the current simulated date.
- Score rules:
  - `+1` when completed (on-time or late)
  - `-1` for each overdue day without completion
  - completion day does not count as overdue
- Cycle resets to Day 0 on every completion.
- Simulated date controls:
  - `Next Day`
  - `Jump to Date` (past/future)
- Archive/restore habits:
  - archived habits stop accruing score
  - restoring starts a fresh cycle at restore date
- Reorder habits with Up/Down controls in both Active and Archived lists.

## Stack

- React + TypeScript (frontend)
- Express + TypeScript (local backend)
- JSON file persistence on disk (`data/habits.json`)

## Development

```bash
npm install
npm run dev
```

This runs both:
- frontend on Vite
- backend API on `http://localhost:8787`

Frontend API requests to `/api/*` are proxied to the backend.

## Build

```bash
npm run build
```

## Run Backend Only

```bash
npm run start:api
```

## Tests

```bash
npm test
```

## Lint

```bash
npm run lint
```
