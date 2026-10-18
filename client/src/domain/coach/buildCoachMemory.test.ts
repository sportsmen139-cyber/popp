import {
  describe,
  expect,
  it,
} from 'vitest'

import { buildCoachMemory } from './buildCoachMemory'

import type { WorkoutSessionResult } from '../../types/workoutSession'

describe('buildCoachMemory', () => {
  it('ignores old sessions without session context', () => {
    const history: WorkoutSessionResult[] = [
      {
        workoutTemplateId: 'workout-a',
        completedAt: '2026-10-01T10:00:00.000Z',
        exercises: [],
      },
    ]

    const memory =
      buildCoachMemory(history)

    expect(memory.analyzedSessions).toBe(0)
  })

  it('collects check-in and adaptation statistics', () => {
    const history: WorkoutSessionResult[] = [
      {
        workoutTemplateId: 'workout-a',
        completedAt: '2026-10-02T10:00:00.000Z',
        exercises: [],
        sessionContext: {
          checkIn: {
            feeling: 'tired',
            sleepQuality: 'poor',
            hasTrainingIssue: true,
            symptoms: ['low_energy'],
            availableMinutes: 30,
          },
          adaptation: {
            offered: true,
            accepted: true,
            actions: [
              'hold_load',
              'shorten_session',
            ],
            reason: 'Test',
            targetMinutes: 30,
          },
        },
      },

      {
        workoutTemplateId: 'workout-b',
        completedAt: '2026-10-03T10:00:00.000Z',
        exercises: [],
        sessionContext: {
          checkIn: {
            feeling: 'normal',
            hasTrainingIssue: false,
            symptoms: [],
          },
          adaptation: {
            offered: false,
            accepted: false,
            actions: ['keep_as_planned'],
          },
        },
      },

      {
        workoutTemplateId: 'workout-c',
        completedAt: '2026-10-04T10:00:00.000Z',
        exercises: [],
        sessionContext: {
          checkIn: {
            feeling: 'great',
            sleepQuality: 'good',
            hasTrainingIssue: true,
            symptoms: [
              'pain_or_discomfort',
              'headache',
            ],
          },
          adaptation: {
            offered: true,
            accepted: false,
            actions: ['hold_load'],
            reason: 'Test',
          },
        },
      },
    ]

    const memory =
      buildCoachMemory(history)

    expect(memory.analyzedSessions).toBe(3)

    expect(memory.feelingCounts).toEqual({
      great: 1,
      normal: 1,
      tired: 1,
      poor: 0,
    })

    expect(memory.sleepCounts).toEqual({
      good: 1,
      normal: 0,
      poor: 1,
      not_provided: 1,
    })

    expect(
      memory.symptomCounts.low_energy,
    ).toBe(1)

    expect(
      memory.symptomCounts
        .pain_or_discomfort,
    ).toBe(1)

    expect(
      memory.symptomCounts.headache,
    ).toBe(1)

    expect(memory.adaptation).toEqual({
      offered: 2,
      accepted: 1,
      declined: 1,
      shortened: 1,
    })
  })

  it('uses only the latest 8 sessions with check-in', () => {
    const history: WorkoutSessionResult[] =
      Array.from(
        { length: 10 },
        (_, index) => ({
          workoutTemplateId: `workout-${index + 1}`,
          completedAt:
            `2026-10-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
          exercises: [],
          sessionContext: {
            checkIn: {
              feeling:
                index < 2
                  ? 'poor' as const
                  : 'great' as const,
              hasTrainingIssue: false,
              symptoms: [],
            },
            adaptation: {
              offered: false,
              accepted: false,
              actions: [
                'keep_as_planned' as const,
              ],
            },
          },
        }),
      )

    const memory =
      buildCoachMemory(history)

    expect(memory.analyzedSessions).toBe(8)
    expect(memory.feelingCounts.great).toBe(8)
    expect(memory.feelingCounts.poor).toBe(0)
  })

})
