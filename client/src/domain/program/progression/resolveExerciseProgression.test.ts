import { describe, expect, it } from 'vitest'

import { resolveExerciseProgression } from './resolveExerciseProgression'

describe('resolveExerciseProgression', () => {
  it('повышает вес, если в последнем подходе 12 чистых повторений', () => {
    const result = resolveExerciseProgression({
      currentSets: [
        {
          setNumber: 1,
          reps: 10,
          weightKg: 50,
        },
        {
          setNumber: 2,
          reps: 10,
          weightKg: 50,
        },
        {
          setNumber: 3,
          reps: 12,
          weightKg: 50,
        },
      ],
    })

    expect(result?.action).toBe(
      'increase_weight',
    )
  })

  it('оставляет вес после 10 повторений', () => {
    const result = resolveExerciseProgression({
      currentSets: [
        {
          setNumber: 1,
          reps: 10,
          weightKg: 50,
        },
        {
          setNumber: 2,
          reps: 10,
          weightKg: 50,
        },
        {
          setNumber: 3,
          reps: 10,
          weightKg: 50,
        },
      ],
    })

    expect(result?.action).toBe('keep_weight')
  })

  it('предупреждает после первых 8 повторений', () => {
    const result = resolveExerciseProgression({
      currentSets: [
        {
          setNumber: 1,
          reps: 10,
          weightKg: 50,
        },
        {
          setNumber: 2,
          reps: 9,
          weightKg: 50,
        },
        {
          setNumber: 3,
          reps: 8,
          weightKg: 50,
        },
      ],
    })

    expect(result?.action).toBe('warning')
  })

  it('снижает вес, если 8 повторений повторились после прошлого низкого результата', () => {
    const result = resolveExerciseProgression({
      currentSets: [
        {
          setNumber: 1,
          reps: 9,
          weightKg: 50,
        },
        {
          setNumber: 2,
          reps: 8,
          weightKg: 50,
        },
        {
          setNumber: 3,
          reps: 8,
          weightKg: 50,
        },
      ],
      previousSets: [
        {
          setNumber: 1,
          reps: 9,
          weightKg: 50,
        },
        {
          setNumber: 2,
          reps: 8,
          weightKg: 50,
        },
        {
          setNumber: 3,
          reps: 8,
          weightKg: 50,
        },
      ],
    })

    expect(result?.action).toBe(
      'reduce_weight',
    )
  })

    it('возвращает null, если повторения не введены', () => {
    const result = resolveExerciseProgression({
      currentSets: [
        {
          setNumber: 1,
          weightKg: 50,
        },
        {
          setNumber: 2,
          weightKg: 50,
        },
        {
          setNumber: 3,
          weightKg: 50,
        },
      ],
    })

    expect(result).toBeNull()
  })

  it('не считает низкий результат повторным, если рабочий вес изменился', () => {
    const result = resolveExerciseProgression({
      currentSets: [
        {
          setNumber: 1,
          weightKg: 47.5,
          reps: 10,
        },
        {
          setNumber: 2,
          weightKg: 47.5,
          reps: 9,
        },
        {
          setNumber: 3,
          weightKg: 47.5,
          reps: 8,
        },
      ],
      previousSets: [
        {
          setNumber: 1,
          weightKg: 50,
          reps: 10,
        },
        {
          setNumber: 2,
          weightKg: 50,
          reps: 9,
        },
        {
          setNumber: 3,
          weightKg: 50,
          reps: 8,
        },
      ],
    })

    expect(result?.action).toBe('warning')
  })

  it('не дает рекомендацию, пока последний подход не заполнен', () => {
    const result = resolveExerciseProgression({
      currentSets: [
        {
          setNumber: 1,
          weightKg: 50,
          reps: 10,
        },
        {
          setNumber: 2,
          weightKg: 50,
          reps: 12,
        },
        {
          setNumber: 3,
          weightKg: 50,
        },
      ],
    })

    expect(result).toBeNull()
  })
    it('сохраняет повышение веса после 12 повторений, если сложность нормальная', () => {
    const result = resolveExerciseProgression({
      currentSets: [
        {
          setNumber: 1,
          reps: 10,
          weightKg: 50,
        },
        {
          setNumber: 2,
          reps: 11,
          weightKg: 50,
        },
        {
          setNumber: 3,
          reps: 12,
          weightKg: 50,
        },
      ],
      difficulty: 'normal',
    })

    expect(result?.action).toBe(
      'increase_weight',
    )
  })

  it('блокирует повышение веса после 12 повторений, если упражнение было тяжёлым', () => {
    const result = resolveExerciseProgression({
      currentSets: [
        {
          setNumber: 1,
          reps: 10,
          weightKg: 50,
        },
        {
          setNumber: 2,
          reps: 11,
          weightKg: 50,
        },
        {
          setNumber: 3,
          reps: 12,
          weightKg: 50,
        },
      ],
      difficulty: 'hard',
    })

    expect(result?.action).toBe(
      'keep_and_retest',
    )

    expect(result?.reason).toBe(
      'difficulty_blocks_increase',
    )
  })

  it('не повышает нагрузку после 12 повторений, если упражнение было очень тяжёлым', () => {
    const result = resolveExerciseProgression({
      currentSets: [
        {
          setNumber: 1,
          reps: 10,
          weightKg: 50,
        },
        {
          setNumber: 2,
          reps: 11,
          weightKg: 50,
        },
        {
          setNumber: 3,
          reps: 12,
          weightKg: 50,
        },
      ],
      difficulty: 'very_hard',
    })

    expect(result?.action).toBe(
      'keep_weight',
    )

    expect(result?.reason).toBe(
      'very_hard_effort',
    )
  })

  it('снижает нагрузку, если пользователь не смог выполнить упражнение', () => {
    const result = resolveExerciseProgression({
      currentSets: [
        {
          setNumber: 1,
          reps: 10,
          weightKg: 50,
        },
        {
          setNumber: 2,
          reps: 10,
          weightKg: 50,
        },
        {
          setNumber: 3,
          reps: 10,
          weightKg: 50,
        },
      ],
      difficulty: 'failed',
    })

    expect(result?.action).toBe(
      'reduce_weight',
    )

    expect(result?.reason).toBe(
      'failed_effort',
    )
  })
})