import {
  describe,
  expect,
  it,
} from 'vitest'

import { resolveCoachInsight } from './resolveCoachInsight'

import type { CoachMemory } from '../../types/coachMemory'

function createMemory(
  analyzedSessions: number,
  tired: number,
  poor: number,
): CoachMemory {
  return {
    analyzedSessions,

    feelingCounts: {
      great: 0,
      normal:
        analyzedSessions -
        tired -
        poor,
      tired,
      poor,
    },

    sleepCounts: {
      good: 0,
      normal: 0,
      poor: 0,
      not_provided: analyzedSessions,
    },

    symptomCounts: {
      pain_or_discomfort: 0,
      cramps: 0,
      low_energy: 0,
      headache: 0,
      bloating: 0,
      other: 0,
    },

    adaptation: {
      offered: 0,
      accepted: 0,
      declined: 0,
      shortened: 0,
    },
  }
}

describe('resolveCoachInsight', () => {
  it('does not create insight before 5 sessions', () => {
    const memory =
      createMemory(4, 4, 0)

    expect(
      resolveCoachInsight(memory),
    ).toBeNull()
  })

  it('creates fatigue insight at 60 percent', () => {
    const memory =
      createMemory(5, 3, 0)

    expect(
      resolveCoachInsight(memory),
    ).toEqual({
      id: 'frequent_fatigue',
      title:
        'Замечаю частую усталость',
      message:
        'В большинстве сохранённых тренировок ты отмечал усталость или плохое самочувствие. Я буду учитывать этот паттерн при дальнейшей адаптации нагрузки.',
    })
  })

  it('does not create fatigue insight below 60 percent', () => {
    const memory =
      createMemory(5, 2, 0)

    expect(
      resolveCoachInsight(memory),
    ).toBeNull()
  })
})
