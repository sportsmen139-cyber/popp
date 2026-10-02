import { basePrograms } from '../../data/basePrograms'
import { trainingEmphases } from '../../data/trainingEmphases'

import type {
  ProgramResolverInput,
} from '../../types/program'

export function resolveProgram(
  input: ProgramResolverInput,
) {
  const baseProgram = basePrograms.find(
    (program) =>
      program.environments.includes(input.environment) &&
      program.daysPerWeek === input.daysPerWeek &&
      program.supportedLevels.includes(input.level),
  )

  if (!baseProgram) {
    return null
  }

  const emphasis = trainingEmphases.find(
    (item) => item.id === input.emphasisId,
  )

  if (!emphasis) {
    return null
  }

  return {
    baseProgram,
    objective: input.objective,
    emphasis,
    level: input.level,
  }
}