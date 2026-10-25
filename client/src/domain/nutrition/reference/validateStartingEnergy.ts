import type { NutritionProfile } from '../../../types/nutrition'
import type { NutritionRange } from '../../../types/nutritionEnergy'
import type {
  Dri2023AdultEerEstimate,
  Dri2023PalCategory,
  EnergyEstimateValidation,
  EnergyEstimateValidationWarning,
  EnergyReferenceComparison,
} from '../../../types/nutritionEnergyValidation'
import type { TrainingActivityInput } from '../buildActivityProfile'
import { estimateStartingEnergy } from '../estimateStartingEnergy'
import { resolveNutritionSafety } from '../resolveNutritionSafety'
import { estimateDri2023AdultEer } from './estimateDri2023AdultEer'

// Engineering regression guardrail, NOT an acceptable physiological error or
// medical boundary. Warn only when EVERY supplied scenario is more than 25%
// from the diagnostic midpoint, with each reference as its own denominator.
export const ENERGY_REFERENCE_WARNING_THRESHOLD_PERCENT = 25

/** Midpoint is diagnostic only and never becomes a production calorie target. */
export function compareEnergyReferenceEstimates(
  productionRange: NutritionRange,
  references: readonly Dri2023AdultEerEstimate[],
): EnergyReferenceComparison | undefined {
  if (
    !Number.isFinite(productionRange.min) || !Number.isFinite(productionRange.max) ||
    productionRange.min <= 0 || productionRange.max < productionRange.min ||
    references.length === 0 ||
    references.some(reference => !Number.isFinite(reference.kcalPerDay) || reference.kcalPerDay <= 0)
  ) return undefined

  const midpoint = productionRange.min + (productionRange.max - productionRange.min) / 2
  const differences = references.map(reference => {
    const signedDifferenceKcal = midpoint - reference.kcalPerDay
    const absoluteDifferenceKcal = Math.abs(signedDifferenceKcal)
    return {
      palCategory: reference.palCategory,
      referenceKcalPerDay: reference.kcalPerDay,
      signedDifferenceKcal,
      absoluteDifferenceKcal,
      percentageDifference: absoluteDifferenceKcal / reference.kcalPerDay * 100,
    }
  })
  const closestPercentageDifference = Math.min(...differences.map(item => item.percentageDifference))
  const referenceEnvelope = {
    min: Math.min(...references.map(reference => reference.kcalPerDay)),
    max: Math.max(...references.map(reference => reference.kcalPerDay)),
  }
  return {
    productionMidpointKcalPerDay: midpoint,
    referenceScenarioEnvelopeKcalPerDay: referenceEnvelope,
    differences,
    closestPercentageDifference,
    largeDiscrepancy: closestPercentageDifference > ENERGY_REFERENCE_WARNING_THRESHOLD_PERCENT,
    productionRangePosition: productionRange.max < referenceEnvelope.min ? 'below_all_scenarios'
      : productionRange.min > referenceEnvelope.max ? 'above_all_scenarios' : 'overlaps_scenario_envelope',
  }
}

/**
 * Dev-only orchestration: no PAL inference, production adjustment or UI. The
 * explicit scenarios are hypotheses, not measured PAL or a confidence interval.
 */
export function validateStartingEnergy(input: {
  nutritionProfile: NutritionProfile
  trainingActivity: TrainingActivityInput
  palScenarios: readonly Dri2023PalCategory[]
}): EnergyEstimateValidation {
  const productionEstimate = estimateStartingEnergy(input)
  const profile = input.nutritionProfile
  const safety = resolveNutritionSafety(profile)
  const palScenarios = [...new Set(input.palScenarios)]
  const referenceEstimates = palScenarios.map(palCategory => estimateDri2023AdultEer({
    age: profile.age,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    calculationCategory: profile.rmrCalculationCategory,
    palCategory,
  }))
  const successfulReferences = referenceEstimates.filter(reference => reference.status === 'estimated')
  const comparison = productionEstimate.status === 'estimated'
    ? compareEnergyReferenceEstimates(productionEstimate.kcalPerDay, successfulReferences)
    : undefined
  const warnings: EnergyEstimateValidationWarning[] = []
  if (palScenarios.length === 0) warnings.push('no_pal_scenarios')
  if (successfulReferences.length !== referenceEstimates.length) warnings.push('reference_estimate_unavailable')
  if (productionEstimate.status !== 'estimated') warnings.push('production_estimate_unavailable')
  if (safety.requiresSafetyReview) warnings.push('safety_review_required')
  if (comparison?.largeDiscrepancy) warnings.push('large_reference_discrepancy')
  if (comparison?.productionRangePosition === 'below_all_scenarios') warnings.push('production_range_below_reference_scenarios')
  if (comparison?.productionRangePosition === 'above_all_scenarios') warnings.push('production_range_above_reference_scenarios')

  // Mathematical reference availability/warnings never grant or revoke these
  // gates. Missing/invalid production inputs still block automatic planning.
  const automaticNutritionPlanAllowed =
    productionEstimate.status === 'estimated' && !safety.requiresSafetyReview
  return {
    productionEstimate, referenceEstimates, comparison,
    palSelection: 'explicit_scenarios_not_inferred', warnings,
    eligibility: {
      automaticNutritionPlanAllowed,
      automaticFatLossAllowed: automaticNutritionPlanAllowed && safety.automaticFatLossAllowed,
      safetyReasons: [...safety.reasons],
    },
  }
}
