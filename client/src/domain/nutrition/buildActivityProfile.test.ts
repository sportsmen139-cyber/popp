import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  buildActivityProfile,
} from './buildActivityProfile'

import type {
  NutritionProfile,
} from '../../types/nutrition'

function createNutritionProfile(
  overrides: Partial<NutritionProfile> = {},
): NutritionProfile {
  return {
    mode: 'simple',
    goal: 'maintenance',

    age: 30,
    heightCm: 175,
    weightKg: 75,

    rmrCalculationCategory: 'male',

    workActivity: 'mostly_seated',

    safetyFlags: [],

    ...overrides,
  }
}

describe('buildActivityProfile', () => {
  it('определяет низкую активность при сидячей работе и 3000 шагах', () => {
    const result =
      buildActivityProfile({
        nutritionProfile:
          createNutritionProfile({
            averageStepsPerDay: 3000,
            workActivity:
              'mostly_seated',
          }),

        trainingActivity: {
          strengthSessionsPerWeek: 0,
          estimatedStrengthMinutesPerWeek:
            0,
        },
      })

    expect(result.level).toBe('low')
  })

  it('определяет умеренную активность при 8000 шагах и регулярных тренировках', () => {
    const result =
      buildActivityProfile({
        nutritionProfile:
          createNutritionProfile({
            averageStepsPerDay: 8000,
            workActivity: 'mixed',
          }),

        trainingActivity: {
          strengthSessionsPerWeek: 3,
          estimatedStrengthMinutesPerWeek:
            180,
        },
      })

    expect(result.level).toBe(
      'moderate',
    )

    expect(
      result.strengthSessionsPerWeek,
    ).toBe(3)
  })

  it('определяет очень высокую активность при физической работе, 12000 шагах и тренировках', () => {
    const result =
      buildActivityProfile({
        nutritionProfile:
          createNutritionProfile({
            averageStepsPerDay: 12000,
            workActivity:
              'physically_active',

            cardioMinutesPerWeek: 90,
          }),

        trainingActivity: {
          strengthSessionsPerWeek: 4,
          estimatedStrengthMinutesPerWeek:
            240,
        },
      })

    expect(result.level).toBe(
      'very_high',
    )
  })

  it('использует ноль для необязательного кардио и другой активности', () => {
    const result =
      buildActivityProfile({
        nutritionProfile:
          createNutritionProfile({
            averageStepsPerDay: 6000,
          }),

        trainingActivity: {
          strengthSessionsPerWeek: 2,
          estimatedStrengthMinutesPerWeek:
            100,
        },
      })

    expect(
      result.cardioMinutesPerWeek,
    ).toBe(0)

    expect(
      result.otherActivityMinutesPerWeek,
    ).toBe(0)

    expect(result.dataAvailability).toEqual({
      cardioMinutesPerWeek: 'missing',
      otherActivityMinutesPerWeek: 'missing',
    })
  })

  it('отличает явно указанный ноль от отсутствующих данных об активности', () => {
    const result = buildActivityProfile({
      nutritionProfile: createNutritionProfile({
        cardioMinutesPerWeek: 0,
        otherActivityMinutesPerWeek: 0,
      }),
      trainingActivity: {
        strengthSessionsPerWeek: 0,
        estimatedStrengthMinutesPerWeek: 0,
      },
    })
    expect(result.dataAvailability).toEqual({
      cardioMinutesPerWeek: 'reported',
      otherActivityMinutesPerWeek: 'reported',
    })
  })
})
