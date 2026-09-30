import { describe, expect, it } from 'vitest'

import { trainingEmphases } from '../../data/trainingEmphases'
import { workoutTemplates } from '../../data/workoutTemplates'

import { resolveWorkoutTemplate } from './resolveWorkoutTemplate'

describe('resolveWorkoutTemplate', () => {
  it('выбирает разные упражнения для Balanced и Glutes', () => {
    const template = workoutTemplates.find(
      (item) => item.id === 'gym-fullbody-a',
    )

    const balanced = trainingEmphases.find(
      (item) => item.id === 'balanced',
    )

    const glutes = trainingEmphases.find(
      (item) => item.id === 'glutes',
    )

    if (!template || !balanced || !glutes) {
      throw new Error('Не найдены данные для теста')
    }

    const balancedWorkout = resolveWorkoutTemplate(
      template,
      balanced,
    )

    const glutesWorkout = resolveWorkoutTemplate(
      template,
      glutes,
    )

    expect(
      balancedWorkout.exercises[0].exerciseId,
    ).toBe('barbell-squat')

    expect(
      glutesWorkout.exercises[0].exerciseId,
    ).toBe('leg-press')
  })
})