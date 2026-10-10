import type { UserProgress } from '../types/progress'

const USER_PROGRESS_KEY = 'fitness-user-progress'

export function saveUserProgress(
  progress: UserProgress,
) {
  localStorage.setItem(
    USER_PROGRESS_KEY,
    JSON.stringify(progress),
  )
}

export function loadUserProgress(): UserProgress {
  const savedProgress = localStorage.getItem(
    USER_PROGRESS_KEY,
  )

  if (!savedProgress) {
    return {
      completedWorkoutsCount: 0,
    }
  }

  try {
    return JSON.parse(savedProgress) as UserProgress
  } catch {
    return {
      completedWorkoutsCount: 0,
    }
  }
}