import {
  describe,
  expect,
  it,
} from 'vitest'

import { resolveCoachInsights } from './resolveCoachInsight'

import type { CoachMemory } from '../../types/coachMemory'

function createMemory(
  analyzedSessions: number,
  tired: number,
  poor: number,
  poorSleep: number = 0,
  normalSleep: number = 0,
  goodSleep: number = 0,
): CoachMemory {
  const recordedSleep =
    poorSleep +
    normalSleep +
    goodSleep

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
      good: goodSleep,
      normal: normalSleep,
      poor: poorSleep,
      not_provided:
        analyzedSessions -
        recordedSleep,
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

describe('resolveCoachInsights', () => {
  it('returns no insights before 5 sessions', () => {
    const memory =
      createMemory(4, 4, 0)

    expect(
      resolveCoachInsights(memory),
    ).toEqual([])
  })

  it('returns fatigue insight at 60 percent', () => {
    const memory =
      createMemory(5, 3, 0)

    expect(
      resolveCoachInsights(memory),
    ).toEqual([
      {
        id: 'frequent_fatigue',
        title:
          'Замечаю частую усталость',
        message:
          'В большинстве последних тренировок ты отмечал усталость или плохое самочувствие. Этот паттерн стоит учитывать при оценке нагрузки.',
      },
    ])
  })

  it('returns no fatigue insight below 60 percent', () => {
    const memory =
      createMemory(5, 2, 0)

    expect(
      resolveCoachInsights(memory),
    ).toEqual([])
  })

  it('returns poor sleep insight when poor sleep reaches 50 percent', () => {
    const memory =
      createMemory(
        5,
        0,
        0,
        2,
        1,
        1,
      )

    expect(
      resolveCoachInsights(memory),
    ).toEqual([
      {
        id: 'frequent_poor_sleep',
        title:
          'Сон часто был плохим',
        message:
          'В половине или более последних тренировок, где ты указал качество сна, сон был плохим. Это стоит учитывать вместе с текущим самочувствием.',
      },
    ])
  })

  it('does not use missing sleep answers as good sleep', () => {
    const memory =
      createMemory(
        5,
        0,
        0,
        2,
        0,
        1,
      )

    expect(
      resolveCoachInsights(memory),
    ).toEqual([])
  })

  it('can return fatigue and poor sleep insights together', () => {
    const memory =
      createMemory(
        5,
        3,
        0,
        2,
        1,
        1,
      )

    expect(
      resolveCoachInsights(memory).map(
        (insight) => insight.id,
      ),
    ).toEqual([
      'frequent_fatigue',
      'frequent_poor_sleep',
    ])
  })

  it('returns shortened sessions insight at 40 percent', () => {
    const memory =
      createMemory(5, 0, 0)

    memory.adaptation.shortened = 2

    expect(
      resolveCoachInsights(memory).map(
        (insight) => insight.id,
      ),
    ).toContain(
      'frequent_shortened_sessions',
    )
  })

  it('does not return shortened sessions insight below 40 percent', () => {
    const memory =
      createMemory(5, 0, 0)

    memory.adaptation.shortened = 1

    expect(
      resolveCoachInsights(memory).map(
        (insight) => insight.id,
      ),
    ).not.toContain(
      'frequent_shortened_sessions',
    )
  })

})
