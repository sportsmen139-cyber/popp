import { describe, expect, it } from 'vitest'

import { resolveProgram } from './resolveProgram'

describe('resolveProgram', () => {
  it('назначает Gym Full Body 3 Days', () => {
    const result = resolveProgram({
      environment: 'gym',
      daysPerWeek: 3,
      level: 'intermediate',
      objective: 'muscle_gain',
      emphasisId: 'glutes',
    })

    expect(result).not.toBeNull()

    expect(result?.baseProgram.id).toBe(
      'gym-fullbody-3',
    )

    expect(result?.emphasis.id).toBe('glutes')

    expect(result?.objective).toBe('muscle_gain')
  })

  it('не придумывает программу, которой пока нет', () => {
    const result = resolveProgram({
      environment: 'gym',
      daysPerWeek: 2,
      level: 'intermediate',
      objective: 'general_fitness',
      emphasisId: 'balanced',
    })

    expect(result).toBeNull()
  })
})