import { describe, expect, it } from 'vitest'
import type { Dri2023AdultEerInput } from '../../../types/nutritionEnergyValidation'
import { estimateDri2023AdultEer } from './estimateDri2023AdultEer'

const input: Dri2023AdultEerInput = {
  age: 30, heightCm: 175, weightKg: 75, calculationCategory: 'male', palCategory: 'inactive',
}

describe('estimateDri2023AdultEer', () => {
  it.each([
    ['inactive', 1.00, 1.53], ['low_active', 1.53, 1.68],
    ['active', 1.68, 1.85], ['very_active', 1.85, 2.50],
  ] as const)('records the official adult %s PAL membership range and interpretation', (palCategory, minInclusive, maxExclusive) => {
    const result = estimateDri2023AdultEer({ ...input, palCategory })
    expect(result).toMatchObject({
      status: 'estimated', palCategory,
      palRange: { minInclusive, maxExclusive },
      predictionKind: 'population_eer_prediction',
      energyRelationship: 'eer_equals_tee_for_weight_stable_adults',
      source: {
        reportDoi: '10.17226/26818', reportChapter: 5, reportTable: '5-16',
        coefficientSourceSection: 'Adults 19 years and older',
        verifiedAgainst: 'health_canada_official_equations',
        coefficientsVerifiedOn: '2026-10-25',
      },
      interpretationLimitations: [
        'population_prediction_not_individual_measurement',
        'prediction_not_category_energy_bound',
        'actual_individual_pal_unknown',
      ],
    })
  })

  // Independent arithmetic examples of the published 2023 equations, not
  // expectations derived by importing the implementation coefficient table.
  it.each([
    ['inactive', 2623.17], ['low_active', 2829.57], ['active', 3014.17], ['very_active', 3322.22],
  ] as const)('uses the adult male 2023 %s equation with height in cm', (palCategory, expected) => {
    const result = estimateDri2023AdultEer({ ...input, palCategory })
    expect(result).toMatchObject({ status: 'estimated', method: 'dri_2023_adult_eer', sourceDoi: '10.17226/26818', palCategory })
    if (result.status !== 'estimated') throw new Error('Missing EER')
    expect(result.kcalPerDay).toBeCloseTo(expected, 2)
  })

  it.each([
    ['inactive', 2021.00], ['low_active', 2182.87], ['active', 2319.45], ['very_active', 2551.68],
  ] as const)('uses the adult female 2023 %s equation', (palCategory, expected) => {
    const result = estimateDri2023AdultEer({ ...input, calculationCategory: 'female', heightCm: 165, weightKg: 60, palCategory })
    if (result.status !== 'estimated') throw new Error('Missing EER')
    expect(result.kcalPerDay).toBeCloseTo(expected, 2)
  })

  it('does not extrapolate adult reference equations to age 18', () => {
    expect(estimateDri2023AdultEer({ ...input, age: 18 })).toEqual({ status: 'unsupported_age', minimumAgeYears: 19 })
    expect(estimateDri2023AdultEer({ ...input, age: 19 }).status).toBe('estimated')
  })

  it.each([
    ['age', NaN], ['heightCm', 0], ['weightKg', -1], ['weightKg', Infinity],
  ] as const)('rejects invalid %s = %s', (field, value) => {
    expect(estimateDri2023AdultEer({ ...input, [field]: value })).toEqual({ status: 'invalid_input', fields: [field] })
  })

  it.each(['calculationCategory', 'palCategory'] as const)('requires explicit valid %s', field => {
    const invalid = { ...input, [field]: 'unknown' } as unknown as Dri2023AdultEerInput
    expect(estimateDri2023AdultEer(invalid)).toEqual({ status: 'invalid_input', fields: [field] })
  })

  it('rejects arithmetic overflow and nonpositive reference energy', () => {
    expect(estimateDri2023AdultEer({ ...input, weightKg: Number.MAX_VALUE })).toEqual({ status: 'invalid_input', fields: ['reference_energy'] })
    expect(estimateDri2023AdultEer({ ...input, age: 1000, weightKg: 1, heightCm: 1 })).toEqual({ status: 'invalid_input', fields: ['reference_energy'] })
  })
})
