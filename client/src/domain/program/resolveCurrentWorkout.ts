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

export function resolveCurrentWorkout(
  input: ResolveCurrentWorkoutInput,
) {
  const trainingPlan = resolveTrainingPlan({
    environment: input.environment,
    daysPerWeek: input.daysPerWeek,
    level: input.level,
    goal: input.goal,
  })

  if (!trainingPlan) {
    return null
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
    return null
  }

  return {
    trainingPlan,
    workout,
  }
}