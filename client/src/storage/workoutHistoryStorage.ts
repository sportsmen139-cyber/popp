import type { WorkoutSessionResult } from '../types/workoutSession'
import { readStored, writeRaw } from './localStorage'
import { isHistory } from './validators'

export const WORKOUT_HISTORY_KEY = 'fitness-workout-history'

export function loadWorkoutHistory():
  WorkoutSessionResult[] {
  return readStored(WORKOUT_HISTORY_KEY, isHistory, [])
}

export function saveWorkoutSession(
  session: WorkoutSessionResult,
) {
  const history = loadWorkoutHistory()

  writeRaw(
    WORKOUT_HISTORY_KEY,
    JSON.stringify([
      ...history,
      session,
    ]),
  )
}
