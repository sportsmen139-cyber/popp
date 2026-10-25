import type { NutritionProfile } from '../../types/nutrition'
import type {
  RmrEstimateResult,
  RmrInvalidField,
} from '../../types/nutritionRmr'
import { resolveNutritionSafety } from './resolveNutritionSafety'

// Mifflin–St Jeor (1990), simplified coefficients: kg, cm, years,
// and category-specific intercept in kcal/day. This is a population model.
const MIFFLIN_ST_JEOR = {
  weightKgCoefficient: 10,
  heightCmCoefficient: 6.25,
  ageYearsCoefficient: -5,
  intercept: { male: 5, female: -161 },
} as const

export function estimateRmr(profile: NutritionProfile): RmrEstimateResult {
  const fields: RmrInvalidField[] = []

  for (const field of ['age', 'heightCm', 'weightKg'] as const) {
    if (!Number.isFinite(profile[field]) || profile[field] <= 0) {
      fields.push(field)
    }
  }

  if (
    profile.rmrCalculationCategory !== 'male' &&
    profile.rmrCalculationCategory !== 'female'
  ) {
    fields.push('rmrCalculationCategory')
  }

  if (fields.length > 0) {
    return { status: 'invalid_input', fields }
  }

  const safety = resolveNutritionSafety(profile)
  if (safety.requiresSafetyReview) {
    return { status: 'requires_safety_review', reasons: safety.reasons }
  }

  const kcalPerDay =
    MIFFLIN_ST_JEOR.weightKgCoefficient * profile.weightKg +
    MIFFLIN_ST_JEOR.heightCmCoefficient * profile.heightCm +
    MIFFLIN_ST_JEOR.ageYearsCoefficient * profile.age +
    MIFFLIN_ST_JEOR.intercept[profile.rmrCalculationCategory]

  // Do not clamp a nonsensical estimate into an apparently usable target.
  if (!Number.isFinite(kcalPerDay) || kcalPerDay <= 0) {
    return {
      status: 'invalid_input',
      fields: ['age', 'heightCm', 'weightKg'],
    }
  }

  return {
    status: 'estimated',
    method: 'mifflin_st_jeor',
    modelVersion: 'beta_1',
    kcalPerDay: Math.round(kcalPerDay),
    confidence: 'low',
    reasons: ['population_formula_estimate', 'not_individually_calibrated'],
  }
}
