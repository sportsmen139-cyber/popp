import {
  describe,
  expect,
  it,
} from 'vitest'

import { resolveExerciseProgression } from './resolveExerciseProgression'

describe('resolveExerciseProgression', () => {
  it('повышает вес, только если все подходы достигли 12 повторений', () => {
    const result =
      resolveExerciseProgression({
        currentSets: [
          {
            setNumber: 1,
            reps: 12,
            weightKg: 50,
          },
          {
            setNumber: 2,
            reps: 12,
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

  it('не повышает вес, если хотя бы один подход ниже 12', () => {
    const result =
      resolveExerciseProgression({
        currentSets: [
          {
            setNumber: 1,
            reps: 12,
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
      })

    expect(result?.action).toBe(
      'keep_and_retest',
    )
  })

  it('оставляет вес при 10 повторениях во всех подходах', () => {
    const result =
      resolveExerciseProgression({
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

    expect(result?.action).toBe(
      'keep_weight',
    )
  })

  it('использует самый слабый подход для оценки результата', () => {
    const result =
      resolveExerciseProgression({
        currentSets: [
          {
            setNumber: 1,
            reps: 10,
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
      'warning',
    )
  })

  it('снижает вес при явном провале хотя бы одного подхода', () => {
    const result =
      resolveExerciseProgression({
        currentSets: [
          {
            setNumber: 1,
            reps: 8,
            weightKg: 50,
          },
          {
            setNumber: 2,
            reps: 7,
            weightKg: 50,
          },
          {
            setNumber: 3,
            reps: 6,
            weightKg: 50,
          },
        ],
      })

    expect(result?.action).toBe(
      'reduce_weight',
    )
  })

  it('снижает вес, если низкий результат повторился на том же весе', () => {
    const result =
      resolveExerciseProgression({
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

  it('возвращает null, если не все подходы заполнены', () => {
    const result =
      resolveExerciseProgression({
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
            weightKg: 50,
          },
        ],
      })

    expect(result).toBeNull()
  })

  it('не считает низкий результат повторным, если рабочий вес изменился', () => {
    const result =
      resolveExerciseProgression({
        currentSets: [
          {
            setNumber: 1,
            reps: 10,
            weightKg: 47.5,
          },
          {
            setNumber: 2,
            reps: 9,
            weightKg: 47.5,
          },
          {
            setNumber: 3,
            reps: 8,
            weightKg: 47.5,
          },
        ],

        previousSets: [
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

    expect(result?.action).toBe(
      'warning',
    )
  })

  it('сохраняет повышение веса при 12 во всех подходах и нормальной сложности', () => {
    const result =
      resolveExerciseProgression({
        currentSets: [
          {
            setNumber: 1,
            reps: 12,
            weightKg: 50,
          },
          {
            setNumber: 2,
            reps: 12,
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

  it('блокирует повышение веса при тяжёлой сложности', () => {
    const result =
      resolveExerciseProgression({
        currentSets: [
          {
            setNumber: 1,
            reps: 12,
            weightKg: 50,
          },
          {
            setNumber: 2,
            reps: 12,
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

  it('не повышает нагрузку при очень тяжёлой сложности', () => {
    const result =
      resolveExerciseProgression({
        currentSets: [
          {
            setNumber: 1,
            reps: 12,
            weightKg: 50,
          },
          {
            setNumber: 2,
            reps: 12,
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
  })

  it('снижает нагрузку, если пользователь выбрал не получилось', () => {
    const result =
      resolveExerciseProgression({
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
  })
})
