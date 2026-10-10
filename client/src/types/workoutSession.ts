export type WorkoutSetResult = {
  setNumber: number
  reps?: number
  weightKg?: number
}

export type WorkoutExerciseResult = {
  exerciseId: string
  sets: WorkoutSetResult[]
}

export type WorkoutSessionResult = {
  workoutTemplateId: string
  completedAt: string
  exercises: WorkoutExerciseResult[]
}