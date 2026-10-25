import type { ExerciseLoadChange, ExerciseLoadTrend, ProgressWindow } from '../../types/progressAnalytics'
import type { WorkoutSessionResult, WorkoutSetResult } from '../../types/workoutSession'
import { historyInProgressWindow } from './progressWindow'

type CompleteSet = WorkoutSetResult & { reps: number; weightKg: number }

function isCompleteSet(set: WorkoutSetResult): set is CompleteSet {
  return Number.isInteger(set.setNumber) && set.setNumber > 0 &&
    typeof set.reps === 'number' && Number.isInteger(set.reps) && set.reps > 0 &&
    typeof set.weightKg === 'number' && Number.isFinite(set.weightKg) && set.weightKg >= 0
}

function completeSets(sets: WorkoutSetResult[]): sets is CompleteSet[] {
  return sets.length > 0 && new Set(sets.map(set => set.setNumber)).size === sets.length &&
    sets.every(isCompleteSet)
}

/** Descriptive average of all recorded sets, never a progression/strength score. */
export function buildExerciseLoadTrend(input: {
  history: readonly WorkoutSessionResult[]
  window: ProgressWindow
  exerciseId: string | null
}): ExerciseLoadTrend {
  if (!input.exerciseId) return { exerciseId: null, status: 'no_exercise', points: [], comparableChange: null }
  const sessions = historyInProgressWindow(input.history, input.window).flatMap(session => {
    const results = Array.isArray(session.exercises)
      ? session.exercises.filter(exercise => exercise.exerciseId === input.exerciseId) : []
    if (results.length === 0) return []
    const sets = results.flatMap(exercise => Array.isArray(exercise.sets) ? exercise.sets : [])
      .toSorted((a, b) => a.setNumber - b.setNumber)
    return [{ session, sets, fullSets: completeSets(sets) ? sets : null }]
  })
  const points = sessions.map(({ session, sets, fullSets }) => {
    const weights = fullSets ? fullSets.map(set => set.weightKg) : []
    return {
      completedAt: session.completedAt,
      timestamp: Date.parse(session.completedAt),
      averageWeightKg: fullSets ? weights.reduce((sum, weight) => sum + weight / weights.length, 0) : null,
      minWeightKg: fullSets ? Math.min(...weights) : null,
      maxWeightKg: fullSets ? Math.max(...weights) : null,
      recordedSets: sets.filter(isCompleteSet).length,
      totalSets: sets.length,
    }
  })
  const validPoints = points.filter(point => point.averageWeightKg !== null)
  const sufficient = new Set(validPoints.map(point => point.timestamp)).size >= 2
  const firstSets = sessions[0]?.fullSets
  const lastSets = sessions.at(-1)?.fullSets
  const fromKg = points[0]?.averageWeightKg
  const toKg = points.at(-1)?.averageWeightKg
  let comparableChange: ExerciseLoadChange | null = null
  if (sufficient && firstSets && lastSets && firstSets.length === lastSets.length &&
    typeof fromKg === 'number' && typeof toKg === 'number' &&
    firstSets.every((set, index) => set.setNumber === lastSets[index].setNumber && set.reps === lastSets[index].reps)) {
    const deltas = firstSets.map((set, index) => lastSets[index].weightKg - set.weightKg)
    const sameDirection = deltas.every(delta => delta >= 0) || deltas.every(delta => delta <= 0)
    if (sameDirection) comparableChange = { fromKg, toKg, deltaKg: toKg - fromKg }
  }
  return {
    exerciseId: input.exerciseId,
    status: sufficient ? 'ready' : 'insufficient_history',
    points,
    comparableChange,
  }
}
