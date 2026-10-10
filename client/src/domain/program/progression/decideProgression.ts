import type {
  ProgressionDecision,
} from '../../../types/progression'

export type ProgressionInput = {
  cleanReps: number
  previousLowPerformance: boolean
}

export function decideProgression(
  input: ProgressionInput,
): ProgressionDecision {
  const {
    cleanReps,
    previousLowPerformance,
  } = input

  if (cleanReps >= 12) {
    return {
      action: 'increase_weight',
      reason: 'twelve_clean_reps',
      message: 'Повышаем вес',
    }
  }

  if (cleanReps === 11) {
    return {
      action: 'keep_and_retest',
      reason: 'eleven_clean_reps',
      message: 'Ты близок к повышению веса',
    }
  }

  if (cleanReps === 10) {
    return {
      action: 'keep_weight',
      reason: 'target_reps_met',
      message: 'Оставляем текущий вес',
    }
  }

  if (cleanReps === 9) {
    return {
      action: 'keep_weight',
      reason: 'nine_clean_reps',
      message: 'Оставляем текущий вес',
    }
  }

  if (cleanReps === 8) {
    if (previousLowPerformance) {
      return {
        action: 'reduce_weight',
        reason: 'repeated_low_performance',
        message: 'Немного снижаем вес',
      }
    }

    return {
      action: 'warning',
      reason: 'first_eight_rep_warning',
      message: 'Оставляем текущий вес',
    }
  }

  return {
    action: 'reduce_weight',
    reason: 'seven_or_fewer_clean_reps',
    message: 'Немного снижаем вес',
  }
}