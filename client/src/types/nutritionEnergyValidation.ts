import type { NutritionSafetyReason } from '../domain/nutrition/resolveNutritionSafety'
import type { RmrCalculationCategory } from './nutrition'
import type { NutritionRange, StartingEnergyEstimateResult } from './nutritionEnergy'

/** Explicit DRI reference scenarios; never inferred from ActivityProfile.level. */
export type Dri2023PalCategory = 'inactive' | 'low_active' | 'active' | 'very_active'

/** Category membership only; these are not individual kcal bounds. */
export type Dri2023PalRange = {
  minInclusive: number
  maxExclusive: number
}

export type Dri2023ReferenceSource = {
  reportDoi: '10.17226/26818'
  reportTitle: string
  reportChapter: 5
  reportTable: '5-16'
  coefficientSourceUrl: string
  coefficientSourceSection: 'Adults 19 years and older'
  palDefinitionSourceUrl: string
  coefficientsVerifiedOn: string
  verifiedAgainst: 'health_canada_official_equations'
}

export type Dri2023InterpretationLimitation =
  | 'population_prediction_not_individual_measurement'
  | 'prediction_not_category_energy_bound'
  | 'actual_individual_pal_unknown'

export type Dri2023AdultEerInput = {
  age: number
  heightCm: number
  weightKg: number
  calculationCategory: RmrCalculationCategory
  palCategory: Dri2023PalCategory
}

/** Mathematical reference only; this value never grants automation eligibility. */
export type Dri2023AdultEerEstimate = {
  status: 'estimated'
  method: 'dri_2023_adult_eer'
  sourceDoi: '10.17226/26818'
  source: Dri2023ReferenceSource
  palCategory: Dri2023PalCategory
  palRange: Dri2023PalRange
  predictionKind: 'population_eer_prediction'
  energyRelationship: 'eer_equals_tee_for_weight_stable_adults'
  interpretationLimitations: Dri2023InterpretationLimitation[]
  kcalPerDay: number
}

export type Dri2023AdultEerResult =
  | Dri2023AdultEerEstimate
  | { status: 'unsupported_age'; minimumAgeYears: 19 }
  | {
      status: 'invalid_input'
      fields: Array<keyof Dri2023AdultEerInput | 'reference_energy'>
    }

export type EnergyReferenceDifference = {
  palCategory: Dri2023PalCategory
  referenceKcalPerDay: number
  /** Production midpoint minus reference; midpoint is for diagnostics only. */
  signedDifferenceKcal: number
  absoluteDifferenceKcal: number
  /** Absolute difference / reference estimate * 100. */
  percentageDifference: number
}

export type EnergyReferenceComparison = {
  productionMidpointKcalPerDay: number
  /** Numeric span of selected point predictions; not individual energy bounds. */
  referencePredictionSpanKcalPerDay: NutritionRange
  differences: EnergyReferenceDifference[]
  closestPercentageDifference: number
  divergenceReviewSuggested: boolean
  /** Informational position only; no under/overestimation conclusion. */
  productionRangePosition: 'below_all_predictions' | 'overlaps_prediction_span' | 'above_all_predictions'
}

/** Current safety + valid production-input gates; no plan generation occurs. */
export type NutritionAutomationEligibility = {
  automaticNutritionPlanAllowed: boolean
  automaticFatLossAllowed: boolean
  safetyReasons: NutritionSafetyReason[]
}

export type EnergyEstimateValidationWarning =
  | 'reference_divergence_review'
  | 'insufficient_activity_information'
  | 'inconsistent_activity_inputs'
  | 'inconsistent_reference_scenario'
  | 'production_estimate_unavailable'
  | 'reference_estimate_unavailable'
  | 'no_pal_scenarios'
  | 'safety_review_required'

export type EnergyEstimateValidationDiagnostic = {
  code: EnergyEstimateValidationWarning | 'population_prediction_comparison'
  kind:
    | 'informational_difference'
    | 'large_divergence'
    | 'inconsistent_scenario'
    | 'insufficient_activity_information'
    | 'reference_unavailable'
    | 'safety_review'
  severity: 'info' | 'review' | 'invalid'
}

/** Dev/domain-only diagnostics. Production must never depend on this result. */
export type EnergyEstimateValidation = {
  productionEstimate: StartingEnergyEstimateResult
  referenceEstimates: Dri2023AdultEerResult[]
  palSelection: 'explicit_scenarios_not_inferred'
  comparison?: EnergyReferenceComparison
  eligibility: NutritionAutomationEligibility
  diagnostics: EnergyEstimateValidationDiagnostic[]
  /** Actionable review/input codes only; ordinary differences are informational. */
  warnings: EnergyEstimateValidationWarning[]
}
