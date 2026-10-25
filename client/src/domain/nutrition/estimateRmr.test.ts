import { describe, expect, it } from 'vitest'
import type { NutritionProfile } from '../../types/nutrition'
import { estimateRmr } from './estimateRmr'

const profile: NutritionProfile = {
  mode: 'simple', goal: 'maintenance', age: 30,
  heightCm: 175, weightKg: 75, rmrCalculationCategory: 'male',
  workActivity: 'mostly_seated', safetyFlags: [],
}

describe('estimateRmr', () => {
  it.each([
    ['male', 1699], ['female', 1533],
  ] as const)('estimates resting energy for %s with explicit uncertainty', (category, expected) => {
    expect(estimateRmr({ ...profile, rmrCalculationCategory: category })).toEqual({
      status: 'estimated', method: 'mifflin_st_jeor', modelVersion: 'beta_1',
      kcalPerDay: expected, confidence: 'low',
      reasons: ['population_formula_estimate', 'not_individually_calibrated'],
    })
  })

  it('does not incorporate activity, nutrition mode or goal into resting energy', () => {
    expect(estimateRmr({
      ...profile, mode: 'tracking', goal: 'fat_loss',
      workActivity: 'physically_active', averageStepsPerDay: 20000,
      cardioMinutesPerWeek: 300, otherActivityMinutesPerWeek: 120,
    })).toEqual(estimateRmr(profile))
  })

  it('accepts the adult boundary', () => {
    expect(estimateRmr({ ...profile, age: 18 }).status).toBe('estimated')
  })

  it('blocks minors without requiring a manually stored flag', () => {
    expect(estimateRmr({ ...profile, age: 17 })).toEqual({
      status: 'requires_safety_review', reasons: ['under_18'],
    })
  })

  it.each([
    'pregnancy', 'breastfeeding', 'eating_disorder_risk',
    'very_low_body_weight', 'rapid_unexplained_weight_change',
    'medical_condition_or_medication', 'clinician_managed_nutrition',
  ] as const)('does not produce a standard estimate for %s', (flag) => {
    expect(estimateRmr({ ...profile, safetyFlags: [flag] })).toEqual({
      status: 'requires_safety_review', reasons: [flag],
    })
  })

  for (const field of ['age', 'heightCm', 'weightKg'] as const) {
    it.each([0, -1, NaN, Infinity, -Infinity])(`rejects invalid ${field}: %s`, (value) => {
      expect(estimateRmr({ ...profile, [field]: value })).toEqual({
        status: 'invalid_input', fields: [field],
      })
    })
  }

  it('rejects an unsupported calculation category from persisted data', () => {
    const input = { ...profile, rmrCalculationCategory: 'unknown' } as unknown as NutritionProfile
    expect(estimateRmr(input)).toEqual({
      status: 'invalid_input', fields: ['rmrCalculationCategory'],
    })
  })

  it('does not emit nonpositive energy for inconsistent positive inputs', () => {
    expect(estimateRmr({ ...profile, age: 100, heightCm: 1, weightKg: 1 })).toEqual({
      status: 'invalid_input', fields: ['age', 'heightCm', 'weightKg'],
    })
  })

  it('does not mutate the profile', () => {
    const before = structuredClone(profile)
    estimateRmr(profile)
    expect(profile).toEqual(before)
  })
})
