import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  resolveSessionAdaptation,
} from './resolveSessionAdaptation'

describe('resolveSessionAdaptation', () => {
  it('оставляет тренировку без изменений при хорошем самочувствии', () => {
    const result =
      resolveSessionAdaptation({
        feeling: 'great',
        sleepQuality: 'good',
        hasTrainingIssue: false,
        symptoms: [],
      })

    expect(result).toEqual({
      actions: [
        'keep_as_planned',
      ],
      reason:
        'Сегодня нет причин менять запланированную тренировку.',
      requiresConfirmation: false,
    })
  })

  it('предлагает лёгкую адаптацию при усталости', () => {
    const result =
      resolveSessionAdaptation({
        feeling: 'tired',
        sleepQuality: 'normal',
        hasTrainingIssue: false,
        symptoms: [],
      })

    expect(result.actions).toEqual([
      'hold_load',
      'increase_rest',
    ])

    expect(
      result.requiresConfirmation,
    ).toBe(true)
  })

  it('предлагает более сильную адаптацию при усталости и плохом сне', () => {
    const result =
      resolveSessionAdaptation({
        feeling: 'tired',
        sleepQuality: 'poor',
        hasTrainingIssue: false,
        symptoms: [],
      })

    expect(result.actions).toEqual([
      'hold_load',
      'reduce_accessory_volume',
      'increase_rest',
    ])
  })

  it('предлагает более сильную адаптацию при нескольких симптомах', () => {
    const result =
      resolveSessionAdaptation({
        feeling: 'normal',
        sleepQuality: 'normal',
        hasTrainingIssue: true,
        symptoms: [
          'pain_or_discomfort',
          'low_energy',
        ],
      })

    expect(result.actions).toEqual([
      'hold_load',
      'reduce_accessory_volume',
      'increase_rest',
    ])
  })

  it('предлагает лёгкую адаптацию при одном симптоме', () => {
    const result =
      resolveSessionAdaptation({
        feeling: 'normal',
        sleepQuality: 'normal',
        hasTrainingIssue: true,
        symptoms: [
          'headache',
        ],
      })

    expect(result.actions).toEqual([
      'hold_load',
      'increase_rest',
    ])
  })

  it('предлагает более сильную адаптацию при плохом самочувствии', () => {
    const result =
      resolveSessionAdaptation({
        feeling: 'poor',
        sleepQuality: 'normal',
        hasTrainingIssue: false,
        symptoms: [],
      })

    expect(result.actions).toEqual([
      'hold_load',
      'reduce_accessory_volume',
      'increase_rest',
    ])
  })

  it('не сокращает тренировку, если доступного времени достаточно', () => {
    const result =
      resolveSessionAdaptation(
        {
          feeling: 'normal',
          sleepQuality: 'good',
          hasTrainingIssue: false,
          symptoms: [],
          availableMinutes: 60,
        },
        60,
      )

    expect(result.actions).toEqual([
      'keep_as_planned',
    ])
  })

  it('сокращает дополнительный объём, если вместо 60 минут есть только 45', () => {
    const result =
      resolveSessionAdaptation(
        {
          feeling: 'normal',
          sleepQuality: 'good',
          hasTrainingIssue: false,
          symptoms: [],
          availableMinutes: 45,
        },
        60,
      )

    expect(result.actions).toEqual([
      'shorten_session',
      'reduce_accessory_volume',
    ])

    expect(result.reason).toContain(
      '45 минут',
    )

    expect(
      result.requiresConfirmation,
    ).toBe(true)
  })

  it('объединяет нехватку времени и плохое самочувствие', () => {
    const result =
      resolveSessionAdaptation(
        {
          feeling: 'tired',
          sleepQuality: 'poor',
          hasTrainingIssue: false,
          symptoms: [],
          availableMinutes: 30,
        },
        60,
      )

    expect(result.actions).toEqual([
      'hold_load',
      'reduce_accessory_volume',
      'increase_rest',
      'shorten_session',
    ])

    expect(result.reason).toContain(
      '30 минут',
    )
  })
})
