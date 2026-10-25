import type { NutritionSafetyReason } from '../domain/nutrition/resolveNutritionSafety'
import type { RmrCalculationCategory } from './nutrition'
import type { NutritionRange, StartingEnergyEstimateResult } from './nutritionEnergy'

/** Explicit DRI reference scenarios; never inferred from ActivityProfile.level. */
export type Dri2023PalCategory = 'inactive' | 'low_active' | 'active' | 'very_active'

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
  palCategory: Dri2023PalCategory
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
  referenceScenarioEnvelopeKcalPerDay: NutritionRange
  differences: EnergyReferenceDifference[]
  closestPercentageDifference: number
  largeDiscrepancy: boolean
  productionRangePosition: 'below_all_scenarios' | 'overlaps_scenario_envelope' | 'above_all_scenarios'
}

/** Current safety + valid production-input gates; no plan generation occurs. */
export type NutritionAutomationEligibility = {
  automaticNutritionPlanAllowed: boolean
  automaticFatLossAllowed: boolean
  safetyReasons: NutritionSafetyReason[]
}

export type EnergyEstimateValidationWarning =
  | 'large_reference_discrepancy'
  | 'production_range_below_reference_scenarios'
  | 'production_range_above_reference_scenarios'
  | 'production_estimate_unavailable'
  | 'reference_estimate_unavailable'
  | 'no_pal_scenarios'
  | 'safety_review_required'

/** Dev/domain-only diagnostics. Production must never depend on this result. */
export type EnergyEstimateValidation = {
  productionEstimate: StartingEnergyEstimateResult
  referenceEstimates: Dri2023AdultEerResult[]
  palSelection: 'explicit_scenarios_not_inferred'
  comparison?: EnergyReferenceComparison
  eligibility: NutritionAutomationEligibility
  warnings: EnergyEstimateValidationWarning[]
}
