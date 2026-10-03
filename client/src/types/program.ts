import type { ExerciseTarget } from './training'

export type TrainingEnvironment =
  | 'gym'
  | 'home'
  | 'outdoor'

export type UserLevel =
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  export type ExerciseSelectionContext = {
  level: UserLevel
  availableEquipment?: string[]
  }
export type TrainingObjective =
  | 'general_fitness'
  | 'muscle_gain'
  | 'strength'
  | 'body_composition'

export type TrainingEmphasisId =
  | 'balanced'
  | 'glutes'
  | 'pullups'
  export type EmphasisRule =
  | {
      type: 'prefer_exercises'
      slotTag: string
      exerciseIds: string[]
    }
  | {
      type: 'add_sets'
      slotTag: string
      setsDelta: number
    }
export type TrainingEmphasis = {
  id: TrainingEmphasisId
  title: string
  description: string
  rules: EmphasisRule[]
}

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'single_leg'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'glute'
  | 'calves'
  | 'arms'
  | 'core'
  | 'conditioning'

export type WorkoutSlotRole =
  | 'primary'
  | 'secondary'
  | 'accessory'

export type WorkoutSlot = {
  id: string
  pattern: MovementPattern
  role: WorkoutSlotRole

  sets: number
  target: ExerciseTarget

  restSeconds: {
    min?: number
    max: number
  }

  candidateExerciseIds: string[]

  tags?: string[]
  optional?: boolean
}

export type WorkoutTemplate = {
  id: string
  title: string
  estimatedMinutes: number
  slots: WorkoutSlot[]
}

export type BaseProgram = {
  id: string
  title: string

  environments: TrainingEnvironment[]

  daysPerWeek: 2 | 3 | 4

  split:
    | 'full_body'
    | 'upper_lower'

  supportedLevels: UserLevel[]

  workoutTemplateIds: string[]

  version: number
}
export type ResolvedWorkoutExercise = {
  slotId: string
  exerciseId: string
  sets: number
  target: ExerciseTarget
  restSeconds: {
    min?: number
    max: number
  }
}

export type ResolvedWorkout = {
  templateId: string
  title: string
  estimatedMinutes: number
  exercises: ResolvedWorkoutExercise[]
}
export type ProgramResolverInput = {
  environment: TrainingEnvironment
  daysPerWeek: 2 | 3 | 4
  level: UserLevel
}
