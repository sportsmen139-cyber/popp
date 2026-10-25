import { describe, expect, it } from 'vitest'
import type { NutritionProfile, NutritionSafetyFlag } from '../../types/nutrition'
import { resolveNutritionSafety } from './resolveNutritionSafety'

const profile: NutritionProfile = {
  mode: 'simple', goal: 'maintenance', age: 30,
  heightCm: 175, weightKg: 75, rmrCalculationCategory: 'male',
  workActivity: 'mostly_seated', safetyFlags: [],
}

const flags: NutritionSafetyFlag[] = [
  'pregnancy', 'breastfeeding', 'eating_disorder_risk',
  'very_low_body_weight', 'rapid_unexplained_weight_change',
  'medical_condition_or_medication', 'clinician_managed_nutrition',
]

describe('resolveNutritionSafety', () => {
  it('allows an adult without flags', () => {
    expect(resolveNutritionSafety(profile)).toEqual({
      requiresSafetyReview: false, automaticFatLossAllowed: true, reasons: [],
    })
  })

  it.each([17, 17.99])('derives under_18 from age %s without a stored flag', (age) => {
    expect(resolveNutritionSafety({ ...profile, age })).toEqual({
      requiresSafetyReview: true, automaticFatLossAllowed: false,
      reasons: ['under_18'],
    })
  })

  it('allows the adult boundary at 18', () => {
    expect(resolveNutritionSafety({ ...profile, age: 18 })).toEqual({
      requiresSafetyReview: false, automaticFatLossAllowed: true, reasons: [],
    })
  })

  it.each(flags)('requires review for %s', (flag) => {
    expect(resolveNutritionSafety({ ...profile, safetyFlags: [flag] })).toEqual({
      requiresSafetyReview: true, automaticFatLossAllowed: false, reasons: [flag],
    })
  })

  it('preserves combined reasons without mutating the profile', () => {
    const input = { ...profile, age: 16, safetyFlags: [...flags] }
    const before = structuredClone(input)
    expect(resolveNutritionSafety(input).reasons).toEqual(['under_18', ...flags])
    expect(input).toEqual(before)
  })
})
