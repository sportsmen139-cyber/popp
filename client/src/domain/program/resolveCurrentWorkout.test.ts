import { describe, expect, it } from 'vitest'

import { resolveCurrentWorkout } from './resolveCurrentWorkout'

describe('resolveCurrentWorkout', () => {
  it('назначает Full Body A с ягодичным акцентом', () => {
    const result = resolveCurrentWorkout({
      environment: 'gym',
      daysPerWeek: 3,
      level: 'intermediate',
      goal: {
        goalType: 'hypertrophy',
        target: {
          type: 'muscle_group',
          id: 'glutes',
        },
        priority: 'high',
      },
      completedWorkoutsCount: 0,
    })

   expect(result.ok).toBe(true)

if (!result.ok) {
  throw new Error(`Не удалось собрать тренировку: ${result.reason}`)
}

    expect(result.trainingPlan.baseProgram.id).toBe(
      'gym-fullbody-3',
    )

    expect(result.trainingPlan.emphasisId).toBe(
      'glutes',
    )

    expect(result.workout.templateId).toBe(
      'gym-fullbody-a',
    )

    expect(
      result.workout.exercises[0].exerciseId,
    ).toBe('leg-press')
  })
  it('возвращает training_plan_not_found, если программы нет', () => {
  const result = resolveCurrentWorkout({
    environment: 'gym',
    daysPerWeek: 2,
    level: 'intermediate',
    goal: {
      goalType: 'general_fitness',
      target: {
        type: 'whole_body',
      },
      priority: 'normal',
    },
    completedWorkoutsCount: 0,
  })

  expect(result).toEqual({
    ok: false,
    reason: 'training_plan_not_found',
  })
})
it('возвращает workout_unavailable, если оборудования недостаточно', () => {
  const result = resolveCurrentWorkout({
    environment: 'gym',
    daysPerWeek: 3,
    level: 'intermediate',
    goal: {
      goalType: 'general_fitness',
      target: {
        type: 'whole_body',
      },
      priority: 'normal',
    },
    completedWorkoutsCount: 0,
    availableEquipment: [],
  })

  expect(result).toEqual({
    ok: false,
    reason: 'workout_unavailable',
  })
})
})