import type { WorkoutSessionResult } from '../types/workoutSession'

const WORKOUT_HISTORY_KEY = 'fitness-workout-history'

export function loadWorkoutHistory():
  WorkoutSessionResult[] {
  const savedHistory = localStorage.getItem(
    WORKOUT_HISTORY_KEY,
  )

  if (!savedHistory) {
    return []
  }

  try {
    return JSON.parse(
      savedHistory,
    ) as WorkoutSessionResult[]
  } catch {
    return []
  }
}

export function saveWorkoutSession(
  session: WorkoutSessionResult,
) {
  const history = loadWorkoutHistory()

  localStorage.setItem(
    WORKOUT_HISTORY_KEY,
    JSON.stringify([
      ...history,
      session,
    ]),
  )
}