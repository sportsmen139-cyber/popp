import { exercises } from '../../data/exercises'
import { resolveEquipmentEligibility } from './resolveEquipment'

import type {
  ExerciseSelectionContext,
  TrainingEmphasis,
  UserLevel,
  WorkoutSlot,
} from '../../types/program'

const levelRank: Record<UserLevel, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
}

export function selectExerciseForSlot(
  slot: WorkoutSlot,
  emphasis: TrainingEmphasis,
  context: ExerciseSelectionContext,
): string | null {
  const eligibleExerciseIds =
    slot.candidateExerciseIds.filter((exerciseId) => {
      const exercise = exercises.find(
        (item) => item.id === exerciseId,
      )

      if (!exercise) {
  return false
}

const levelMatches =
  levelRank[exercise.difficulty] <=
  levelRank[context.level]

if (!levelMatches) {
  return false
}

if (!exercise.environments.includes(context.environment) ||
    exercise.movement.status !== 'classified' ||
    !exercise.supportedTargetTypes.includes(slot.target.type)) {
  return false
}

return resolveEquipmentEligibility(exercise.equipment, context) !== 'unavailable'
    })

  if (eligibleExerciseIds.length === 0) {
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
        eligibleExerciseIds.includes(exerciseId),
    )

    if (preferredExerciseId) {
      return preferredExerciseId
    }
  }

  return eligibleExerciseIds[0]
}
