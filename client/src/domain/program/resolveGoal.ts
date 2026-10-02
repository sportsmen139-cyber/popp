import type { TrainingGoal } from '../../types/goal'
import type { TrainingEmphasisId } from '../../types/program'

export function resolveGoal(
  goal: TrainingGoal,
): TrainingEmphasisId | null {
  if (goal.target.type === 'whole_body') {
    return 'balanced'
  }

  if (
    goal.goalType === 'hypertrophy' &&
    goal.target.type === 'muscle_group' &&
    goal.target.id === 'glutes'
  ) {
    return 'glutes'
  }

  if (
    goal.goalType === 'exercise_performance' &&
    goal.target.type === 'exercise' &&
    goal.target.id === 'pull_up'
  ) {
    return 'pullups'
  }

  return null
}
