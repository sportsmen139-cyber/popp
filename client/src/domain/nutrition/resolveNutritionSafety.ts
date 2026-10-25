import type {
  NutritionProfile,
  NutritionSafetyFlag,
} from '../../types/nutrition'

export type NutritionSafetyReason =
  | 'under_18'
  | NutritionSafetyFlag

export type NutritionSafetyResult = {
  requiresSafetyReview: boolean
  automaticFatLossAllowed: boolean
  reasons: NutritionSafetyReason[]
}

export function resolveNutritionSafety(
  profile: NutritionProfile,
): NutritionSafetyResult {
  const reasons: NutritionSafetyReason[] =
    []

  if (profile.age < 18) {
    reasons.push('under_18')
  }

  reasons.push(...profile.safetyFlags)

  const requiresSafetyReview =
    reasons.length > 0

  return {
    requiresSafetyReview,

    automaticFatLossAllowed:
      !requiresSafetyReview,

    reasons,
  }
}
