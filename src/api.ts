import { httpHabitApi } from './httpApi'
import type { HabitApi } from './shared/ipc'

export function getHabitApi(): HabitApi {
  return httpHabitApi
}
