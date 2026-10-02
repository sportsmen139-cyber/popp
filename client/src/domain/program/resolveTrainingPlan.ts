import type { TrainingGoal } from '../../types/goal'
import type {
  TrainingEnvironment,
  UserLevel,
} from '../../types/program'

import { resolveGoal } from './resolveGoal'
import { resolveProgram } from './resolveProgram'

type ResolveTrainingPlanInput = {
  environment: TrainingEnvironment
  daysPerWeek: 2 | 3 | 4
  level: UserLevel
  goal: TrainingGoal
}

export function resolveTrainingPlan(
  input: ResolveTrainingPlanInput,
) {
  const baseProgram = resolveProgram({
    environment: input.environment,
    daysPerWeek: input.daysPerWeek,
    level: input.level,
  })

  if (!baseProgram) {
    return null
  }

  const emphasisId = resolveGoal(input.goal)

  if (!emphasisId) {
    return null
  }

  return {
    baseProgram,
    goal: input.goal,
    emphasisId,
    level: input.level,
  }
}
