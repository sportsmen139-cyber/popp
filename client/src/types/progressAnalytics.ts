import type { WeightEntry } from './weightEntry'

export type ProgressPeriodWeeks = 4 | 8 | 12

export type ProgressWindow = {
  weeks: ProgressPeriodWeeks
  start: Date
  end: Date
  currentWeekStart: Date
}

export type WeeklyWorkoutProgress = {
  weekStart: string
  label: string
  completed: number
  /** Current profile target only, not a reconstructed historical schedule. */
  currentPlanTarget?: number
  isCurrentWeek: boolean
}

export type ExerciseLoadPoint = {
  completedAt: string
  timestamp: number
  /** Null preserves an honest gap when a session has incomplete set records. */
  averageWeightKg: number | null
  minWeightKg: number | null
  maxWeightKg: number | null
  recordedSets: number
  totalSets: number
  /** Recorded repetitions in set order; missing/invalid values remain unknown. */
  repsBySet: Array<{ setNumber: number; reps: number | null }>
}

export type ExerciseLoadChange = {
  fromKg: number
  toKg: number
  deltaKg: number
}

export type ExerciseLoadTrend = {
  exerciseId: string | null
  status: 'ready' | 'insufficient_history' | 'no_exercise'
  points: ExerciseLoadPoint[]
  comparableChange: ExerciseLoadChange | null
}

export type ProgressInsight = {
  id: string
  title: string
  message: string
}

export type ProgressView = {
  window: ProgressWindow
  workoutCount: number
  lastWorkoutAt: string | null
  goalLabel: string
  exerciseOptions: Array<{ id: string; name: string }>
  selectedExerciseId: string | null
  selectedExerciseName: string | null
  weekly: WeeklyWorkoutProgress[]
  loadTrend: ExerciseLoadTrend
  insights: ProgressInsight[]
  weightHistory: { status: 'not_available'; entries: readonly WeightEntry[] }
}
