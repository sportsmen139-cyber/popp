import type {
  ExerciseDifficulty,
  WorkoutSetResult,
} from '../../../types/workoutSession'

import type {
  ProgressionDecision,
} from '../../../types/progression'

import {
  adjustProgressionForDifficulty,
} from './adjustProgressionForDifficulty'

import {
  decideProgression,
} from './decideProgression'

type ResolveExerciseProgressionInput = {
  currentSets: WorkoutSetResult[]
  previousSets?: WorkoutSetResult[]
  difficulty?: ExerciseDifficulty
}

function getWeakestCompletedSet(
  sets: WorkoutSetResult[],
): WorkoutSetResult | null {
  if (sets.length === 0) {
    return null
  }

  if (
    sets.some(
      (set) => set.reps === undefined,
    )
  ) {
    return null
  }

  return [...sets]
    .sort(
      (a, b) =>
        a.setNumber - b.setNumber,
    )
    .reduce(
      (weakestSet, currentSet) => {
        const weakestReps =
          weakestSet.reps ?? Infinity

        const currentReps =
          currentSet.reps ?? Infinity

        if (currentReps <= weakestReps) {
          return currentSet
        }

        return weakestSet
      },
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
  const weakestCurrentSet =
    getWeakestCompletedSet(
      input.currentSets,
    )

  if (
    weakestCurrentSet === null ||
    weakestCurrentSet.reps === undefined
  ) {
    return null
  }

  const weakestPreviousSet =
    input.previousSets
      ? getWeakestCompletedSet(
          input.previousSets,
        )
      : null

  const previousLowPerformance =
    weakestPreviousSet !== null &&
    weakestPreviousSet.reps !==
      undefined &&
    weakestPreviousSet.reps <= 8 &&
    isSameWorkingWeight(
      weakestCurrentSet,
      weakestPreviousSet,
    )

  const baseDecision =
    decideProgression({
      cleanReps:
        weakestCurrentSet.reps,
      previousLowPerformance,
    })

  if (input.difficulty === undefined) {
    return baseDecision
  }

  return adjustProgressionForDifficulty(
    baseDecision,
    input.difficulty,
  )
}
