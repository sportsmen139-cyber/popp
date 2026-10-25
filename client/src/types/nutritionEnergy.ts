import type { NutritionSafetyReason } from '../domain/nutrition/resolveNutritionSafety'
import type { ActivityProfile } from './nutritionActivity'
import type { RmrEstimate, RmrInvalidField } from './nutritionRmr'

export type NutritionRange = {
  min: number
  max: number
}

/** Completeness of starting activity inputs, NOT calibration confidence. */
export type StartingActivityDataCompleteness = {
  level: 'low' | 'medium' | 'high'
  missingFields: Array<
    | 'averageStepsPerDay'
    | 'cardioMinutesPerWeek'
    | 'otherActivityMinutesPerWeek'
  >
  issues: Array<
    | 'strength_duration_missing'
    | 'strength_sessions_missing'
    | 'low_steps_with_physical_work'
  >
}

export type StartingEnergyReason =
  | 'steps_and_work_combined_by_maximum'
  | 'work_used_without_steps'
  | 'structured_activity_overlap_envelope'
  | 'no_structured_activity_reported'

export type StartingEnergyLimitation =
  | 'beta_heuristic_not_measured_tdee'
  | 'not_individually_calibrated'
  | 'activity_intensity_and_work_duration_unknown'
  | 'activity_overlap_unknown'
  | 'missing_activity_data'
  | 'activity_signals_need_review'

/** A starting maintenance hypothesis; neither a measured TDEE nor intake advice. */
export type StartingEnergyEstimate = {
  status: 'estimated'
  kind: 'estimated_maintenance'
  method: 'activity_envelope_beta'
  modelVersion: 'beta_1'
  rmr: RmrEstimate
  activity: ActivityProfile
  /** Outward-rounded scenario bounds, NOT a statistical confidence interval. */
  kcalPerDay: NutritionRange
  confidence: 'low'
  dataCompleteness: StartingActivityDataCompleteness
  reasons: StartingEnergyReason[]
  limitations: StartingEnergyLimitation[]
  /** Net activity above rest; combined activity already accounts for overlap. */
  components: {
    dailyActivityKcalPerDay: NutritionRange
    structuredActivityKcalPerDay: NutritionRange
    combinedActivityKcalPerDay: NutritionRange
    /** Diagnostic model defaults; no personal exercise intensity was measured. */
    assumedStructuredNetMet: {
      source: 'beta_defaults_not_reported_intensity'
      strength: NutritionRange
      cardio: NutritionRange
      other: NutritionRange
    }
    thermicEffectFraction: NutritionRange
    /** Unrounded model output for energy-balance checks, not display precision. */
    energyBeforeRoundingKcalPerDay: NutritionRange
  }
}

export type StartingEnergyInvalidField =
  | RmrInvalidField
  | 'averageStepsPerDay'
  | 'workActivity'
  | 'strengthSessionsPerWeek'
  | 'estimatedStrengthMinutesPerWeek'
  | 'cardioMinutesPerWeek'
  | 'otherActivityMinutesPerWeek'
  | 'totalStructuredMinutesPerWeek'
  | 'rmr.kcalPerDay'
  | 'energy_range'

export type StartingEnergyEstimateResult =
  | StartingEnergyEstimate
  | { status: 'requires_safety_review'; reasons: NutritionSafetyReason[] }
  | { status: 'invalid_input'; fields: StartingEnergyInvalidField[] }
