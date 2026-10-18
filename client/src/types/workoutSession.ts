import type { SessionCheckIn } from './session'
import type { SessionAdaptationAction } from './sessionAdaptation'

export type WorkoutSetResult = {
  setNumber: number
  reps?: number
  weightKg?: number
}

export type ExerciseDifficulty =
  | 'very_easy'
  | 'normal'
  | 'hard'
  | 'very_hard'
  | 'failed'

export type WorkoutExerciseResult = {
  exerciseId: string
  sets: WorkoutSetResult[]
  difficulty?: ExerciseDifficulty
}

export type WorkoutSessionAdaptation = {
  offered: boolean
  accepted: boolean
  actions: SessionAdaptationAction[]
  reason?: string
  targetMinutes?: number
}

export type WorkoutSessionContext = {
  checkIn: SessionCheckIn
  adaptation: WorkoutSessionAdaptation
}

export type WorkoutSessionResult = {
  workoutTemplateId: string
  completedAt: string
  exercises: WorkoutExerciseResult[]

  sessionContext?: WorkoutSessionContext
}