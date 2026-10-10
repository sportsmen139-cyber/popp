import { describe, expect, it } from 'vitest'
import { decideProgression } from './decideProgression'

describe('decideProgression', () => {
  it('повышает вес после 12 чистых повторений', () => {
    const result = decideProgression({
      cleanReps: 12,
      previousLowPerformance: false,
    })

    expect(result.action).toBe('increase_weight')
  })

  it('оставляет вес и предлагает повторную проверку после 11 повторений', () => {
    const result = decideProgression({
      cleanReps: 11,
      previousLowPerformance: false,
    })

    expect(result.action).toBe('keep_and_retest')
  })

  it('оставляет вес после 10 повторений', () => {
    const result = decideProgression({
      cleanReps: 10,
      previousLowPerformance: false,
    })

    expect(result.action).toBe('keep_weight')
  })

  it('оставляет вес после 9 повторений', () => {
    const result = decideProgression({
      cleanReps: 9,
      previousLowPerformance: false,
    })

    expect(result.action).toBe('keep_weight')
  })

  it('предупреждает после первых 8 повторений', () => {
    const result = decideProgression({
      cleanReps: 8,
      previousLowPerformance: false,
    })

    expect(result.action).toBe('warning')
  })

  it('снижает вес после повторного низкого результата в 8 повторений', () => {
    const result = decideProgression({
      cleanReps: 8,
      previousLowPerformance: true,
    })

    expect(result.action).toBe('reduce_weight')
  })

  it('снижает вес после 7 или меньше чистых повторений', () => {
    const result = decideProgression({
      cleanReps: 7,
      previousLowPerformance: false,
    })

    expect(result.action).toBe('reduce_weight')
  })
})