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
      {
        level: 'intermediate',
      },
    )

    const glutesWorkout = resolveWorkoutTemplate(
      template,
      glutes,
      {
        level: 'intermediate',
      },
    )

    expect(
      balancedWorkout.exercises[0].exerciseId,
    ).toBe('barbell-squat')

    expect(
      glutesWorkout.exercises[0].exerciseId,
    ).toBe('leg-press')
  })

  it('учитывает доступное оборудование', () => {
    const template = workoutTemplates.find(
      (item) => item.id === 'gym-fullbody-a',
    )

    const balanced = trainingEmphases.find(
      (item) => item.id === 'balanced',
    )

    if (!template || !balanced) {
      throw new Error('Не найдены данные для теста')
    }

    const workout = resolveWorkoutTemplate(
      template,
      balanced,
      {
        level: 'intermediate',
        availableEquipment: [],
      },
    )

    const horizontalPush = workout.exercises.find(
      (exercise) =>
        exercise.slotId === 'a-horizontal-push',
    )

    expect(horizontalPush?.exerciseId).toBe('push-up')
  })
})