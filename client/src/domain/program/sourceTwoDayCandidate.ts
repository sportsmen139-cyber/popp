import type { TrainingGoal } from '../../types/goal'
import type { TrainingEnvironment, UserLevel } from '../../types/program'

// Metadata from registered source 191944…; no imported prose or source workouts in this bundle.
// Candidate metadata is not an assignment or a readiness/rights receipt.
const candidates = [
  { id: 'PRG_000001', level: 'beginner', goal: 'general_fitness', target: null },
  { id: 'PRG_000013', level: 'intermediate', goal: 'hypertrophy', target: null },
  { id: 'PRG_000021', level: 'intermediate', goal: 'hypertrophy', target: 'legs' },
] as const

export function sourceTwoDayCandidate(input: {
  environment: TrainingEnvironment
  daysPerWeek: number
  level: UserLevel
  goal: TrainingGoal
}) {
  if (input.environment !== 'gym' || input.daysPerWeek !== 2) return null
  const target = input.goal.target.type === 'whole_body' ? null
    : input.goal.target.type === 'muscle_group' ? input.goal.target.id : undefined
  const candidate = candidates.find((item) => item.level === input.level && item.goal === input.goal.goalType && item.target === target)
  return candidate ? { programId: candidate.id, sourceVersion: 1, daysPerWeek: 2, status: 'preparation_required' as const } : null
}
