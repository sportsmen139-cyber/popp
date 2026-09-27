export type ExerciseVideoType =
  | 'technique'
  | 'setup'
  | 'detailed'

export type ExerciseVideo = {
  id: string
  type: ExerciseVideoType
  url: string
  title?: string
}

export type Exercise = {
  id: string
  name: string

  muscleGroups: string[]
  equipment: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'

  videos: ExerciseVideo[]

  technique: {
    setup?: string
    startPosition?: string
    movement?: string
    breathing?: string
    commonMistakes?: string[]
    warnings?: string[]
  }
}

export type TargetType =
  | 'reps'
  | 'time'
  | 'distance'

export type ExerciseTarget =
  | {
      type: TargetType
      mode: 'range'
      min: number
      max: number
    }
  | {
      type: TargetType
      mode: 'fixed'
      value: number
    }
  | {
      type: TargetType
      mode: 'max'
    }
    export type WorkoutExercise = {
  exerciseId: string
    alternativeExerciseIds?: string[]
    alternatives?: WorkoutExerciseAlternative[]
  order: number
  optional?: boolean

  sets: number

target: ExerciseTarget

  restSeconds: {
  min?: number
  max: number
}

  targetRir?: {
    min: number
    max: number
  }

  notes?: string
}
export type WorkoutExerciseAlternative = {
  exerciseId: string
  target?: ExerciseTarget
}

export type Workout = {
  id: string
  title: string
  estimatedMinutes?: number

  format?: 'standard' | 'circuit'
  timeLimitMinutes?: number

  exercises: WorkoutExercise[]
}

export type TrainingProgram = {
  id: string
  title: string
  description?: string

  level: 'beginner' | 'intermediate' | 'advanced'

  location:
    | 'gym'
    | 'home'
    | 'outdoor'
    | 'mixed'

  workoutsPerWeek: number

  workoutIds: string[]
}