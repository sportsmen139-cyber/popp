import { describe, expect, it } from 'vitest'

import type {
  ProgressionDecision,
} from '../../../types/progression'

import {
  adjustProgressionForDifficulty,
} from './adjustProgressionForDifficulty'

describe('adjustProgressionForDifficulty', () => {
  it('не мешает повышению веса, если сложность была нормальной', () => {
    const baseDecision: ProgressionDecision = {
      action: 'increase_weight',
      reason: 'twelve_clean_reps',
      message: 'Повышаем вес',
    }

    const result =
      adjustProgressionForDifficulty(
        baseDecision,
        'normal',
      )

    expect(result).toEqual(baseDecision)
  })

  it('блокирует повышение веса, если упражнение было тяжёлым', () => {
    const baseDecision: ProgressionDecision = {
      action: 'increase_weight',
      reason: 'twelve_clean_reps',
      message: 'Повышаем вес',
    }

    const result =
      adjustProgressionForDifficulty(
        baseDecision,
        'hard',
      )

    expect(result).toEqual({
      action: 'keep_and_retest',
      reason: 'difficulty_blocks_increase',
      message:
        'Пока не повышаем вес: упражнение было тяжёлым',
    })
  })

  it('не повышает нагрузку, если упражнение было очень тяжёлым', () => {
    const baseDecision: ProgressionDecision = {
      action: 'increase_weight',
      reason: 'twelve_clean_reps',
      message: 'Повышаем вес',
    }

    const result =
      adjustProgressionForDifficulty(
        baseDecision,
        'very_hard',
      )

    expect(result).toEqual({
      action: 'keep_weight',
      reason: 'very_hard_effort',
      message:
        'Не повышаем нагрузку: упражнение было очень тяжёлым',
    })
  })

  it('подтверждает снижение веса, если повторения уже показывают низкую результативность', () => {
    const baseDecision: ProgressionDecision = {
      action: 'reduce_weight',
      reason: 'seven_or_fewer_clean_reps',
      message: 'Немного снижаем вес',
    }

    const result =
      adjustProgressionForDifficulty(
        baseDecision,
        'very_hard',
      )

    expect(result).toEqual({
      action: 'reduce_weight',
      reason: 'very_hard_effort',
      message:
        'Немного снижаем вес: упражнение было очень тяжёлым',
    })
  })

  it('требует снижения нагрузки, если пользователь не смог выполнить упражнение', () => {
    const baseDecision: ProgressionDecision = {
      action: 'keep_weight',
      reason: 'target_reps_met',
      message: 'Оставляем текущий вес',
    }

    const result =
      adjustProgressionForDifficulty(
        baseDecision,
        'failed',
      )

    expect(result).toEqual({
      action: 'reduce_weight',
      reason: 'failed_effort',
      message:
        'Снижаем нагрузку: текущая нагрузка оказалась слишком высокой',
    })
  })
})