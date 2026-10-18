import type {
  ResolvedWorkout,
  ResolvedWorkoutExercise,
} from '../../types/program'

import type {
  SessionAdaptation,
} from '../../types/sessionAdaptation'

function shortenWorkout(
  exercises: ResolvedWorkoutExercise[],
  targetMinutes: number,
) {
  if (targetMinutes <= 20) {
    const primaryExercises =
      exercises.filter(
        (exercise) =>
          exercise.role === 'primary',
      )

    if (primaryExercises.length > 0) {
      return primaryExercises
    }

    return exercises.slice(0, 2)
  }

  if (targetMinutes <= 30) {
    return exercises
      .filter(
        (exercise) =>
          exercise.role !== 'accessory',
      )
      .map((exercise) => {
        if (
          exercise.role === 'secondary'
        ) {
          return {
            ...exercise,
            sets: Math.max(
              1,
              exercise.sets - 1,
            ),
          }
        }

        return exercise
      })
  }

  return exercises
}

export function applySessionAdaptation(
  workout: ResolvedWorkout,
  adaptation: SessionAdaptation,
): ResolvedWorkout {
  if (
    adaptation.actions.includes(
      'keep_as_planned',
    )
  ) {
    return workout
  }

  const reduceAccessoryVolume =
    adaptation.actions.includes(
      'reduce_accessory_volume',
    )

  const increaseRest =
    adaptation.actions.includes(
      'increase_rest',
    )

  const shortenSession =
    adaptation.actions.includes(
      'shorten_session',
    ) &&
    adaptation.targetMinutes !==
      undefined

  let exercises =
    workout.exercises.map(
      (exercise) => {
        const shouldReduceSets =
          reduceAccessoryVolume &&
          exercise.role === 'accessory'

        const sets = shouldReduceSets
          ? Math.max(
              1,
              exercise.sets - 1,
            )
          : exercise.sets

        const restSeconds =
          increaseRest
            ? {
                min:
                  exercise.restSeconds
                    .min !== undefined
                    ? exercise.restSeconds
                        .min + 30
                    : undefined,

                max:
                  exercise.restSeconds
                    .max + 30,
              }
            : exercise.restSeconds

        return {
          ...exercise,
          sets,
          restSeconds,
        }
      },
    )

  if (
    shortenSession &&
    adaptation.targetMinutes !==
      undefined
  ) {
    exercises = shortenWorkout(
      exercises,
      adaptation.targetMinutes,
    )
  }

  return {
    ...workout,

    estimatedMinutes:
      shortenSession &&
      adaptation.targetMinutes !==
        undefined
        ? adaptation.targetMinutes
        : workout.estimatedMinutes,

    exercises,
  }
}