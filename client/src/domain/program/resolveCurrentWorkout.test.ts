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

    expect(result).not.toBeNull()

    expect(result?.trainingPlan.baseProgram.id).toBe(
      'gym-fullbody-3',
    )

    expect(result?.trainingPlan.emphasisId).toBe(
      'glutes',
    )

    expect(result?.workout.templateId).toBe(
      'gym-fullbody-a',
    )

    expect(
      result?.workout.exercises[0].exerciseId,
    ).toBe('leg-press')
  })
})