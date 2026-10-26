import type { TrainingGoal } from '../../types/goal'
import type {
  TrainingEnvironment,
  UserLevel,
} from '../../types/program'

import { resolveNextWorkout } from './resolveNextWorkout'
import { resolveTrainingPlan } from './resolveTrainingPlan'
import { createExerciseSelectionContext } from './resolveEquipment'
import type { EquipmentId, EquipmentSelectionPolicy } from '../../types/equipment'

type ResolveCurrentWorkoutInput = {
  environment: TrainingEnvironment
  daysPerWeek: 2 | 3 | 4
  level: UserLevel

  goal: TrainingGoal

  completedWorkoutsCount: number

  availableEquipment?: readonly EquipmentId[]
}

type ResolveCurrentWorkoutFailureReason =
  | 'training_plan_not_found'
  | 'workout_unavailable'
  | 'invalid_equipment_inventory'
type ResolveCurrentWorkoutResult =
  | {
      ok: true
      trainingPlan: NonNullable<
        ReturnType<typeof resolveTrainingPlan>
      >
      workout: NonNullable<
        ReturnType<typeof resolveNextWorkout>
      >
      equipmentResolution: {
        inventoryStatus: 'known' | 'not_collected'
        policy: EquipmentSelectionPolicy
      }
    }
  | {
      ok: false
      reason: ResolveCurrentWorkoutFailureReason
    }
export function resolveCurrentWorkout(
  input: ResolveCurrentWorkoutInput,
): ResolveCurrentWorkoutResult {
  const trainingPlan = resolveTrainingPlan({
    environment: input.environment,
    daysPerWeek: input.daysPerWeek,
    level: input.level,
    goal: input.goal,
  })

  if (!trainingPlan) {
  return {
    ok: false,
    reason: 'training_plan_not_found',
  }
}

  const context = createExerciseSelectionContext({
    environment: input.environment,
    level: input.level,
    availableEquipment: input.availableEquipment,
  })
  if (context.inventory.status === 'invalid') {
    return { ok: false, reason: 'invalid_equipment_inventory' }
  }

  const workout = resolveNextWorkout({
    baseProgram: trainingPlan.baseProgram,
    emphasisId: trainingPlan.emphasisId,
    completedWorkoutsCount:
      input.completedWorkoutsCount,
    context,
  })

  if (!workout) {
  return {
    ok: false,
    reason: 'workout_unavailable',
  }
}

  return {
  ok: true,
  trainingPlan,
  workout,
  equipmentResolution: { inventoryStatus: context.inventory.status, policy: context.equipmentPolicy },
}
}
