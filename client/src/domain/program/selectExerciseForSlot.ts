import type {
  TrainingEmphasis,
  WorkoutSlot,
} from '../../types/program'

export function selectExerciseForSlot(
  slot: WorkoutSlot,
  emphasis: TrainingEmphasis,
): string | null {
  if (slot.candidateExerciseIds.length === 0) {
    return null
  }

  for (const rule of emphasis.rules) {
    if (rule.type !== 'prefer_exercises') {
      continue
    }

    const slotMatchesEmphasis =
      slot.tags?.includes(rule.slotTag) ?? false

    if (!slotMatchesEmphasis) {
      continue
    }

    const preferredExerciseId = rule.exerciseIds.find(
      (exerciseId) =>
        slot.candidateExerciseIds.includes(exerciseId),
    )

    if (preferredExerciseId) {
      return preferredExerciseId
    }
  }

  return slot.candidateExerciseIds[0]
}