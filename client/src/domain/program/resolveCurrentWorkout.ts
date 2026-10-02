import type { TrainingGoal } from '../../types/goal'
import type {
  TrainingEnvironment,
  UserLevel,
} from '../../types/program'

import { resolveNextWorkout } from './resolveNextWorkout'
import { resolveTrainingPlan } from './resolveTrainingPlan'

type ResolveCurrentWorkoutInput = {
  environment: TrainingEnvironment
  daysPerWeek: 2 | 3 | 4
  level: UserLevel

  goal: TrainingGoal

  completedWorkoutsCount: number

  availableEquipment?: string[]
}

type ResolveCurrentWorkoutFailureReason =
  | 'training_plan_not_found'
  | 'workout_unavailable'
type ResolveCurrentWorkoutResult =
  | {
      ok: true
      trainingPlan: NonNullable<
        ReturnType<typeof resolveTrainingPlan>
      >
      workout: NonNullable<
        ReturnType<typeof resolveNextWorkout>
      >
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

  const workout = resolveNextWorkout({
    baseProgram: trainingPlan.baseProgram,
    emphasisId: trainingPlan.emphasisId,
    completedWorkoutsCount:
      input.completedWorkoutsCount,
    context: {
      level: input.level,
      availableEquipment:
        input.availableEquipment,
    },
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
}
}