import type {
  ResolvedWorkout,
  TrainingEmphasis,
  WorkoutTemplate,
} from '../../types/program'

import { selectExerciseForSlot } from './selectExerciseForSlot'

export function resolveWorkoutTemplate(
  template: WorkoutTemplate,
  emphasis: TrainingEmphasis,
): ResolvedWorkout {
  const exercises = template.slots
    .map((slot) => {
      const exerciseId = selectExerciseForSlot(
        slot,
        emphasis,
      )

      if (!exerciseId) {
        return null
      }

      return {
        slotId: slot.id,
        exerciseId,
        sets: slot.sets,
        target: slot.target,
        restSeconds: slot.restSeconds,
      }
    })
    .filter(
      (
        exercise,
      ): exercise is NonNullable<typeof exercise> =>
        exercise !== null,
    )

  return {
    templateId: template.id,
    title: template.title,
    exercises,
  }
}