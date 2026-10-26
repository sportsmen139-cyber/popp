import { trainingEmphases } from '../../data/trainingEmphases'
import { workoutTemplates } from '../../data/workoutTemplates'

import type {
  BaseProgram,
  ExerciseSelectionContext,
  TrainingEmphasisId,
} from '../../types/program'

import { resolveWorkoutTemplate } from './resolveWorkoutTemplate'

type ResolveNextWorkoutInput = {
  baseProgram: BaseProgram
  emphasisId: TrainingEmphasisId
  completedWorkoutsCount: number
  context: ExerciseSelectionContext
}

export function resolveNextWorkout(
  input: ResolveNextWorkoutInput,
) {
  if (!input.baseProgram.environments.includes(input.context.environment)) return null
  if (input.baseProgram.workoutTemplateIds.length === 0) {
    return null
  }

  const safeCompletedWorkoutsCount = Math.max(
    0,
    Math.floor(input.completedWorkoutsCount),
  )

  const workoutIndex =
    safeCompletedWorkoutsCount %
    input.baseProgram.workoutTemplateIds.length

  const workoutTemplateId =
    input.baseProgram.workoutTemplateIds[workoutIndex]

  const template = workoutTemplates.find(
    (item) => item.id === workoutTemplateId,
  )

  if (!template) {
    return null
  }

  const emphasis = trainingEmphases.find(
    (item) => item.id === input.emphasisId,
  )

  if (!emphasis) {
    return null
  }

  return resolveWorkoutTemplate(
    template,
    emphasis,
    input.context,
  )
}
