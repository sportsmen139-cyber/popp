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
})