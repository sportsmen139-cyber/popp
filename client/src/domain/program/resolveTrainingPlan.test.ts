import { describe, expect, it } from 'vitest'

import { resolveTrainingPlan } from './resolveTrainingPlan'

describe('resolveTrainingPlan', () => {
  it('назначает программу и акцент для цели роста ягодиц', () => {
    const result = resolveTrainingPlan({
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
    })

    expect(result).not.toBeNull()

    expect(result?.baseProgram.id).toBe(
      'gym-fullbody-3',
    )

    expect(result?.emphasisId).toBe('glutes')

    expect(result?.goal.goalType).toBe(
      'hypertrophy',
    )
  })
})
