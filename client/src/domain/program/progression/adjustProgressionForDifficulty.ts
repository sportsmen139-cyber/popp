import type {
  ProgressionDecision,
} from '../../../types/progression'

import type {
  ExerciseDifficulty,
} from '../../../types/workoutSession'

import {
  resolveDifficultyProgressionSignal,
} from './resolveDifficultyProgressionSignal'

export function adjustProgressionForDifficulty(
  baseDecision: ProgressionDecision,
  difficulty: ExerciseDifficulty,
): ProgressionDecision {
  const signal =
    resolveDifficultyProgressionSignal(
      difficulty,
    )

  if (
    signal === 'increase_candidate' ||
    signal === 'keep_course'
  ) {
    return baseDecision
  }

  if (signal === 'no_increase') {
    if (
      baseDecision.action ===
      'increase_weight'
    ) {
      return {
        action: 'keep_and_retest',
        reason: 'difficulty_blocks_increase',
        message:
          'Пока не повышаем вес: упражнение было тяжёлым',
      }
    }

    return baseDecision
  }

  if (signal === 'reduce_candidate') {
    if (
      baseDecision.action ===
      'reduce_weight'
    ) {
      return {
        action: 'reduce_weight',
        reason: 'very_hard_effort',
        message:
          'Немного снижаем вес: упражнение было очень тяжёлым',
      }
    }

    return {
      action: 'keep_weight',
      reason: 'very_hard_effort',
      message:
        'Не повышаем нагрузку: упражнение было очень тяжёлым',
    }
  }

  return {
    action: 'reduce_weight',
    reason: 'failed_effort',
    message:
      'Снижаем нагрузку: текущая нагрузка оказалась слишком высокой',
  }
}