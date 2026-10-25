import type { NutritionProfile } from '../../../types/nutrition'
import type { NutritionRange } from '../../../types/nutritionEnergy'
import type {
  Dri2023AdultEerEstimate,
  Dri2023PalCategory,
  EnergyEstimateValidation,
  EnergyEstimateValidationDiagnostic,
  EnergyReferenceComparison,
} from '../../../types/nutritionEnergyValidation'
import type { TrainingActivityInput } from '../buildActivityProfile'
import { estimateStartingEnergy } from '../estimateStartingEnergy'
import { resolveNutritionSafety } from '../resolveNutritionSafety'
import { estimateDri2023AdultEer } from './estimateDri2023AdultEer'
import { DRI_2023_ADULT_PAL_RANGES } from './dri2023Model'

// Engineering diagnostic only: suggests reviewing assumptions when EVERY
// explicit population prediction is >25% from the diagnostic midpoint. This
// does not assert that production is wrong or define a physiological boundary.
export const REFERENCE_DIVERGENCE_REVIEW_THRESHOLD_PERCENT = 25

/** Midpoint is diagnostic only and never becomes a production calorie target. */
export function compareEnergyReferenceEstimates(
  productionRange: NutritionRange,
  references: readonly Dri2023AdultEerEstimate[],
): EnergyReferenceComparison | undefined {
  if (
    !Number.isFinite(productionRange.min) || !Number.isFinite(productionRange.max) ||
    productionRange.min <= 0 || productionRange.max < productionRange.min ||
    references.length === 0 ||
    references.some(reference => {
      const expectedPalRange = Object.hasOwn(DRI_2023_ADULT_PAL_RANGES, reference.palCategory)
        ? DRI_2023_ADULT_PAL_RANGES[reference.palCategory] : undefined
      return !Number.isFinite(reference.kcalPerDay) || reference.kcalPerDay <= 0 ||
        !expectedPalRange ||
        reference.palRange?.minInclusive !== expectedPalRange.minInclusive ||
        reference.palRange?.maxExclusive !== expectedPalRange.maxExclusive
    })
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
  // Finite input numbers can still overflow a diagnostic percentage.
  if (differences.some(item => !Number.isFinite(item.percentageDifference))) return undefined
  const closestPercentageDifference = Math.min(...differences.map(item => item.percentageDifference))
  const referenceEnvelope = {
    min: Math.min(...references.map(reference => reference.kcalPerDay)),
    max: Math.max(...references.map(reference => reference.kcalPerDay)),
  }
  return {
    productionMidpointKcalPerDay: midpoint,
    referencePredictionSpanKcalPerDay: referenceEnvelope,
    differences,
    closestPercentageDifference,
    divergenceReviewSuggested: closestPercentageDifference > REFERENCE_DIVERGENCE_REVIEW_THRESHOLD_PERCENT,
    productionRangePosition: productionRange.max < referenceEnvelope.min ? 'below_all_predictions'
      : productionRange.min > referenceEnvelope.max ? 'above_all_predictions' : 'overlaps_prediction_span',
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
  const diagnostics: EnergyEstimateValidationDiagnostic[] = []
  if (palScenarios.length === 0) {
    diagnostics.push({ code: 'no_pal_scenarios', kind: 'insufficient_activity_information', severity: 'review' })
  }
  if (successfulReferences.length !== referenceEstimates.length) {
    const invalidReference = referenceEstimates.some(reference => reference.status === 'invalid_input')
    diagnostics.push({
      code: 'reference_estimate_unavailable',
      kind: invalidReference ? 'inconsistent_scenario' : 'reference_unavailable',
      severity: invalidReference ? 'invalid' : 'review',
    })
  }
  if (productionEstimate.status !== 'estimated') {
    diagnostics.push({
      code: 'production_estimate_unavailable',
      kind: productionEstimate.status === 'invalid_input' ? 'inconsistent_scenario' : 'safety_review',
      severity: productionEstimate.status === 'invalid_input' ? 'invalid' : 'review',
    })
  } else {
    const { missingFields, issues } = productionEstimate.dataCompleteness
    if (missingFields.length > 0 || issues.some(issue => issue !== 'strength_sessions_missing')) {
      diagnostics.push({ code: 'insufficient_activity_information', kind: 'insufficient_activity_information', severity: 'review' })
    }
    if (issues.includes('strength_sessions_missing')) {
      diagnostics.push({ code: 'inconsistent_activity_inputs', kind: 'inconsistent_scenario', severity: 'review' })
    }
    if (successfulReferences.length > 0 && !comparison) {
      diagnostics.push({ code: 'inconsistent_reference_scenario', kind: 'inconsistent_scenario', severity: 'invalid' })
    }
  }
  if (safety.requiresSafetyReview) {
    diagnostics.push({ code: 'safety_review_required', kind: 'safety_review', severity: 'review' })
  }
  if (comparison) {
    diagnostics.push({ code: 'population_prediction_comparison', kind: 'informational_difference', severity: 'info' })
    if (comparison.divergenceReviewSuggested) {
      diagnostics.push({ code: 'reference_divergence_review', kind: 'large_divergence', severity: 'review' })
    }
  }
  const warnings = diagnostics.flatMap(diagnostic =>
    diagnostic.code === 'population_prediction_comparison' ? [] : [diagnostic.code])

  // Mathematical reference availability/warnings never grant or revoke these
  // gates. Missing/invalid production inputs still block automatic planning.
  const automaticNutritionPlanAllowed =
    productionEstimate.status === 'estimated' && !safety.requiresSafetyReview
  return {
    productionEstimate, referenceEstimates, comparison, diagnostics,
    palSelection: 'explicit_scenarios_not_inferred', warnings,
    eligibility: {
      automaticNutritionPlanAllowed,
      automaticFatLossAllowed: automaticNutritionPlanAllowed && safety.automaticFatLossAllowed,
      safetyReasons: [...safety.reasons],
    },
  }
}
