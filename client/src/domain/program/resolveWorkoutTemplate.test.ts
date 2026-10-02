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
      throw new Error('Не найдены тестовые данные')
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

    if (!balancedWorkout || !glutesWorkout) {
      throw new Error('Не удалось собрать тренировку')
    }

    expect(
      balancedWorkout.exercises[0].exerciseId,
    ).toBe('barbell-squat')

    expect(
      glutesWorkout.exercises[0].exerciseId,
    ).toBe('leg-press')
  })

  it('учитывает доступное оборудование при выборе упражнения', () => {
    const fullTemplate = workoutTemplates.find(
      (item) => item.id === 'gym-fullbody-a',
    )

    const balanced = trainingEmphases.find(
      (item) => item.id === 'balanced',
    )

    if (!fullTemplate || !balanced) {
      throw new Error('Не найдены тестовые данные')
    }

    const template = {
      ...fullTemplate,
      slots: fullTemplate.slots.filter(
        (slot) => slot.id === 'a-horizontal-push',
      ),
    }

    const workout = resolveWorkoutTemplate(
      template,
      balanced,
      {
        level: 'intermediate',
        availableEquipment: [],
      },
    )

    expect(workout).not.toBeNull()
    expect(workout?.exercises[0].exerciseId).toBe(
      'push-up',
    )
  })

  it('возвращает null, если для обязательного слота нет упражнения', () => {
    const fullTemplate = workoutTemplates.find(
      (item) => item.id === 'gym-fullbody-a',
    )

    const balanced = trainingEmphases.find(
      (item) => item.id === 'balanced',
    )

    if (!fullTemplate || !balanced) {
      throw new Error('Не найдены тестовые данные')
    }

    const template = {
      ...fullTemplate,
      slots: fullTemplate.slots.filter(
        (slot) => slot.id === 'a-squat',
      ),
    }

    const workout = resolveWorkoutTemplate(
      template,
      balanced,
      {
        level: 'intermediate',
        availableEquipment: [],
      },
    )

    expect(workout).toBeNull()
  })
it('пропускает optional-слот, если для него нет упражнения', () => {
  const fullTemplate = workoutTemplates.find(
    (item) => item.id === 'gym-fullbody-a',
  )

  const balanced = trainingEmphases.find(
    (item) => item.id === 'balanced',
  )

  if (!fullTemplate || !balanced) {
    throw new Error('Не найдены тестовые данные')
  }

  const squatSlot = fullTemplate.slots.find(
    (slot) => slot.id === 'a-squat',
  )

  if (!squatSlot) {
    throw new Error('Не найден слот a-squat')
  }

  const template = {
    ...fullTemplate,
    slots: [
      {
        ...squatSlot,
        optional: true,
      },
    ],
  }

  const workout = resolveWorkoutTemplate(
    template,
    balanced,
    {
      level: 'intermediate',
      availableEquipment: [],
    },
  )

  expect(workout).not.toBeNull()
  expect(workout?.exercises).toHaveLength(0)
})
})