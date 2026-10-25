import type { WorkoutSessionResult, WorkoutSetResult } from '../../types/workoutSession'

export const progressNow = new Date(2026, 9, 25, 18)
export const progressDate = (month: number, day: number, hour = 12) => new Date(2026, month - 1, day, hour).toISOString()

export function recordedSession(completedAt: string, exerciseId = 'squat', sets: WorkoutSetResult[] = [
  { setNumber: 1, reps: 10, weightKg: 60 }, { setNumber: 2, reps: 10, weightKg: 60 },
]): WorkoutSessionResult {
  return { completedAt, workoutTemplateId: 'workout-a', exercises: [{ exerciseId, sets }] }
}
