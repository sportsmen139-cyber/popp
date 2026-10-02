import { basePrograms } from '../../data/basePrograms'

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

  return baseProgram ?? null
}