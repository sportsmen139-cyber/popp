import type {
  ExerciseSelectionContext,
  ResolvedWorkout,
  ResolvedWorkoutExercise,
  TrainingEmphasis,
  WorkoutTemplate,
} from '../../types/program'

import { selectExerciseForSlot } from './selectExerciseForSlot'

export function resolveWorkoutTemplate(
  template: WorkoutTemplate,
  emphasis: TrainingEmphasis,
  context: ExerciseSelectionContext,
): ResolvedWorkout | null {
  const resolvedExercises: ResolvedWorkoutExercise[] = []

  for (const slot of template.slots) {
    const exerciseId = selectExerciseForSlot(
      slot,
      emphasis,
      context,
    )

    if (!exerciseId) {
      if (slot.optional) {
        continue
      }

      return null
    }

    resolvedExercises.push({
      slotId: slot.id,
      exerciseId,
      sets: slot.sets,
      target: slot.target,
      restSeconds: slot.restSeconds,
    })
  }

  return {
    templateId: template.id,
    title: template.title,
    estimatedMinutes: template.estimatedMinutes,
    exercises: resolvedExercises,
  }
}