export type NutritionMode =
  | 'simple'
  | 'tracking'

export type NutritionGoal =
  | 'maintenance'
  | 'fat_loss'
  | 'muscle_gain'
  | 'body_recomposition'
  | 'performance'
  | 'return_to_training'

export type RmrCalculationCategory =
  | 'male'
  | 'female'

export type WorkActivityLevel =
  | 'mostly_seated'
  | 'mixed'
  | 'mostly_standing'
  | 'physically_active'

export type NutritionSafetyFlag =
  | 'pregnancy'
  | 'breastfeeding'
  | 'eating_disorder_risk'
  | 'very_low_body_weight'
  | 'rapid_unexplained_weight_change'
  | 'medical_condition_or_medication'
  | 'clinician_managed_nutrition'

export type NutritionProfile = {
  mode: NutritionMode

  goal: NutritionGoal

  age: number
  heightCm: number
  weightKg: number

  rmrCalculationCategory:
    RmrCalculationCategory

  averageStepsPerDay?: number

  workActivity:
    WorkActivityLevel

  cardioMinutesPerWeek?: number

  otherActivityMinutesPerWeek?: number

  safetyFlags: NutritionSafetyFlag[]
}
