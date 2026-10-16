import type {
  ExerciseDifficulty,
} from '../../../types/workoutSession'

export type DifficultyProgressionSignal =
  | 'increase_candidate'
  | 'keep_course'
  | 'no_increase'
  | 'reduce_candidate'
  | 'reduce_required'

export function resolveDifficultyProgressionSignal(
  difficulty: ExerciseDifficulty,
): DifficultyProgressionSignal {
  switch (difficulty) {
    case 'very_easy':
      return 'increase_candidate'

    case 'normal':
      return 'keep_course'

    case 'hard':
      return 'no_increase'

    case 'very_hard':
      return 'reduce_candidate'

    case 'failed':
      return 'reduce_required'
  }
}