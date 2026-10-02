import { describe, expect, it } from 'vitest'

import { resolveGoal } from './resolveGoal'

describe('resolveGoal', () => {
  it('превращает цель роста ягодиц в glutes emphasis', () => {
    const result = resolveGoal({
      goalType: 'hypertrophy',
      target: {
        type: 'muscle_group',
        id: 'glutes',
      },
      priority: 'high',
    })

    expect(result).toBe('glutes')
  })

  it('превращает цель улучшения подтягиваний в pullups emphasis', () => {
    const result = resolveGoal({
      goalType: 'exercise_performance',
      target: {
        type: 'exercise',
        id: 'pull_up',
      },
      priority: 'high',
    })

    expect(result).toBe('pullups')
  })

  it('для общей цели выбирает balanced', () => {
    const result = resolveGoal({
      goalType: 'general_fitness',
      target: {
        type: 'whole_body',
      },
      priority: 'normal',
    })

    expect(result).toBe('balanced')
  })

  it('возвращает null для пока неподдерживаемой цели', () => {
    const result = resolveGoal({
      goalType: 'hypertrophy',
      target: {
        type: 'muscle_group',
        id: 'shoulders',
      },
      priority: 'high',
    })

    expect(result).toBeNull()
  })
})
