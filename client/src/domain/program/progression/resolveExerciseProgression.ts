import type { WorkoutSetResult } from '../../../types/workoutSession'
import type { ProgressionDecision } from '../../../types/progression'

import { decideProgression } from './decideProgression'

type ResolveExerciseProgressionInput = {
  currentSets: WorkoutSetResult[]
  previousSets?: WorkoutSetResult[]
}

function getLastCompletedSet(
  sets: WorkoutSetResult[],
): WorkoutSetResult | null {
  const completedSets = sets
    .filter((set) => set.reps !== undefined)
    .sort(
      (a, b) => a.setNumber - b.setNumber,
    )

  return (
    completedSets[
      completedSets.length - 1
    ] ?? null
  )
}

function isSameWorkingWeight(
  currentSet: WorkoutSetResult,
  previousSet: WorkoutSetResult,
) {
  const currentWeight =
    currentSet.weightKg

  const previousWeight =
    previousSet.weightKg

  if (
    currentWeight === undefined &&
    previousWeight === undefined
  ) {
    return true
  }

  if (
    currentWeight === undefined ||
    previousWeight === undefined
  ) {
    return false
  }

  return currentWeight === previousWeight
}

export function resolveExerciseProgression(
  input: ResolveExerciseProgressionInput,
): ProgressionDecision | null {
  const currentSet =
    getLastCompletedSet(input.currentSets)

  if (
    currentSet === null ||
    currentSet.reps === undefined
  ) {
    return null
  }

  const previousSet =
    input.previousSets
      ? getLastCompletedSet(
          input.previousSets,
        )
      : null

  const previousLowPerformance =
    previousSet !== null &&
    previousSet.reps !== undefined &&
    previousSet.reps <= 8 &&
    isSameWorkingWeight(
      currentSet,
      previousSet,
    )

  return decideProgression({
    cleanReps: currentSet.reps,
    previousLowPerformance,
  })
}