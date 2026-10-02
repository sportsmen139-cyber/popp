import { describe, expect, it } from 'vitest'

import { resolveProgram } from './resolveProgram'

describe('resolveProgram', () => {
  it('назначает Gym Full Body 3 Days', () => {
    const result = resolveProgram({
      environment: 'gym',
      daysPerWeek: 3,
      level: 'intermediate',
    })

    expect(result).not.toBeNull()
    expect(result?.id).toBe('gym-fullbody-3')
  })

  it('возвращает null, если подходящей программы пока нет', () => {
    const result = resolveProgram({
      environment: 'gym',
      daysPerWeek: 2,
      level: 'intermediate',
    })

    expect(result).toBeNull()
  })
})