import type {
  WorkoutSetResult,
} from '../../../types/workoutSession'

import type {
  ProgressionDecision,
} from '../../../types/progression'

import { decideProgression } from './decideProgression'

type ResolveExerciseProgressionInput = {
  currentSets: WorkoutSetResult[]
  previousSets?: WorkoutSetResult[]
}

function getLastSetReps(
  sets: WorkoutSetResult[],
): number | null {
  const completedSets = sets
    .filter((set) => set.reps !== undefined)
    .sort(
      (a, b) => a.setNumber - b.setNumber,
    )

  const lastSet =
    completedSets[completedSets.length - 1]

  return lastSet?.reps ?? null
}

export function resolveExerciseProgression(
  input: ResolveExerciseProgressionInput,
): ProgressionDecision | null {
  const currentCleanReps =
    getLastSetReps(input.currentSets)

  if (currentCleanReps === null) {
    return null
  }

  const previousCleanReps =
    input.previousSets
      ? getLastSetReps(input.previousSets)
      : null

  const previousLowPerformance =
    previousCleanReps !== null &&
    previousCleanReps <= 8

  return decideProgression({
    cleanReps: currentCleanReps,
    previousLowPerformance,
  })
}