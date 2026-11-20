import type { UserProgress } from '../types/progress'
import { readStored, writeRaw } from './localStorage'
import { isProgress } from './validators'

export const USER_PROGRESS_KEY = 'fitness-user-progress'

export function saveUserProgress(
  progress: UserProgress,
) {
  writeRaw(
    USER_PROGRESS_KEY,
    JSON.stringify(progress),
  )
}

export function loadUserProgress(): UserProgress {
  return readStored(USER_PROGRESS_KEY, isProgress, { completedWorkoutsCount: 0 })
}
