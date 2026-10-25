import type { NutritionSafetyReason } from '../domain/nutrition/resolveNutritionSafety'

export type RmrInvalidField =
  | 'age'
  | 'heightCm'
  | 'weightKg'
  | 'rmrCalculationCategory'

export type RmrEstimate = {
  status: 'estimated'
  method: 'mifflin_st_jeor'
  modelVersion: 'beta_1'
  /** Resting energy only; not TDEE, a calorie target, or a measurement. */
  kcalPerDay: number
  confidence: 'low'
  reasons: ['population_formula_estimate', 'not_individually_calibrated']
}

export type RmrEstimateResult =
  | RmrEstimate
  | {
      status: 'requires_safety_review'
      reasons: NutritionSafetyReason[]
    }
  | {
      status: 'invalid_input'
      fields: RmrInvalidField[]
    }
