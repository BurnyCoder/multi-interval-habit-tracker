import type { HabitApi } from './shared/ipc'
import type { DbFile, ISODate } from './shared/types'

interface ApiErrorResponse {
  error?: string
}

interface WarningResponse {
  warning: string | null
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const payload = (await response.json()) as ApiErrorResponse
      if (payload.error) {
        message = payload.error
      }
    } catch {
      // best-effort parse only
    }

    throw new Error(message)
  }

  return (await response.json()) as T
}

function withBody(body: unknown): RequestInit {
  return {
    method: 'POST',
    body: JSON.stringify(body),
  }
}

export const httpHabitApi: HabitApi = {
  app: {
    getState: async () => requestJson<DbFile>('/api/state'),
    getLastLoadError: async () => {
      const { warning } = await requestJson<WarningResponse>('/api/last-load-error')
      return warning
    },
  },
  clock: {
    nextDay: async () => requestJson<DbFile>('/api/clock/next-day', { method: 'POST' }),
    jumpToDate: async (date: ISODate) => requestJson<DbFile>('/api/clock/jump-to-date', withBody({ date })),
  },
  habit: {
    add: async (name, intervalDays) => requestJson<DbFile>('/api/habits', withBody({ name, intervalDays })),
    edit: async (id, name, intervalDays, effectiveDate) =>
      requestJson<DbFile>(`/api/habits/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, intervalDays, effectiveDate }),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    toggleCompletion: async (id, date) =>
      requestJson<DbFile>(`/api/habits/${id}/toggle-completion`, withBody({ date })),
    archive: async (id, date) => requestJson<DbFile>(`/api/habits/${id}/archive`, withBody({ date })),
    restore: async (id, date) => requestJson<DbFile>(`/api/habits/${id}/restore`, withBody({ date })),
    reorder: async (id, direction, date) =>
      requestJson<DbFile>(`/api/habits/${id}/reorder`, withBody({ direction, date })),
    deletePermanent: async (id) => requestJson<DbFile>(`/api/habits/${id}`, { method: 'DELETE' }),
  },
}
