import { describe, expect, it } from 'vitest'
import type { NutritionSafetyFlag } from '../../../types/nutrition'
import type { Dri2023AdultEerEstimate, Dri2023PalCategory } from '../../../types/nutritionEnergyValidation'
import { estimateStartingEnergy } from '../estimateStartingEnergy'
import {
  compareEnergyReferenceEstimates,
  REFERENCE_DIVERGENCE_REVIEW_THRESHOLD_PERCENT,
  validateStartingEnergy,
} from './validateStartingEnergy'
import { ENERGY_VALIDATION_PERSONAS, PERSONA_PRODUCTION_MAX_RELATIVE_CHANGE } from './validationPersonas.fixtures'
import { estimateDri2023AdultEer } from './estimateDri2023AdultEer'

const firstPersona = ENERGY_VALIDATION_PERSONAS[0]

function syntheticReference(kcalPerDay: number, palCategory: Dri2023PalCategory = 'inactive'): Dri2023AdultEerEstimate {
  const metadata = estimateDri2023AdultEer({ age: 30, heightCm: 175, weightKg: 75, calculationCategory: 'male', palCategory })
  if (metadata.status !== 'estimated') throw new Error('Missing test reference metadata')
  return { ...metadata, kcalPerDay }
}

describe('starting energy reference validation', () => {
  it.each(ENERGY_VALIDATION_PERSONAS)('checks $id against explicitly chosen DRI scenarios', persona => {
    const result = validateStartingEnergy(persona)
    expect(result.productionEstimate.status).toBe('estimated')
    expect(result.referenceEstimates).toHaveLength(persona.palScenarios.length)
    expect(result.referenceEstimates.every(reference => reference.status === 'estimated')).toBe(true)
    expect(result.comparison).toBeDefined()
    expect(result.comparison?.differences.map(item => item.palCategory)).toEqual(persona.palScenarios)
    expect(persona.scenarioRationale.trim().length).toBeGreaterThan(0)
    expect(persona.comparisonPurpose).toBe('diagnostic_population_benchmark_only')
    if (result.productionEstimate.status !== 'estimated') throw new Error('Missing production estimate')
    // Catch huge/unexpected production changes against its OWN recorded baseline,
    // independently of DRI predictions or the diagnostic review threshold.
    for (const bound of ['min', 'max'] as const) {
      const actual = result.productionEstimate.kcalPerDay[bound]
      expect(Number.isFinite(actual)).toBe(true)
      expect(actual).toBeGreaterThan(0)
      expect(Math.abs(actual / persona.productionBaselineKcalPerDay[bound] - 1)).toBeLessThanOrEqual(PERSONA_PRODUCTION_MAX_RELATIVE_CHANGE)
    }
    expect(result.productionEstimate.kcalPerDay.min).toBeLessThanOrEqual(result.productionEstimate.kcalPerDay.max)
    expect(Number.isFinite(result.comparison?.closestPercentageDifference)).toBe(true)
    expect(result.diagnostics).toContainEqual({ code: 'population_prediction_comparison', kind: 'informational_difference', severity: 'info' })
    expect(result.productionEstimate).toEqual(estimateStartingEnergy(persona))
  })

  it('retains low completeness for missing steps rather than using reference to fill them', () => {
    const result = validateStartingEnergy(ENERGY_VALIDATION_PERSONAS[5])
    expect(result.productionEstimate).toMatchObject({ status: 'estimated', dataCompleteness: { level: 'low' }, confidence: 'low' })
    expect(result.diagnostics).toContainEqual({ code: 'insufficient_activity_information', kind: 'insufficient_activity_information', severity: 'review' })
  })

  it('treats a production range below category predictions as information, not an underestimation warning', () => {
    const result = validateStartingEnergy(firstPersona)
    expect(result.comparison?.productionRangePosition).toBe('below_all_predictions')
    expect(result.warnings).toEqual([])
    expect(result.diagnostics).toEqual([{ code: 'population_prediction_comparison', kind: 'informational_difference', severity: 'info' }])
    expect(result.eligibility.automaticNutritionPlanAllowed).toBe(true)
  })

  it('preserves work/step overlap protection for the physical worker persona', () => {
    const worker = ENERGY_VALIDATION_PERSONAS[4]
    const result = validateStartingEnergy(worker)
    const seated = estimateStartingEnergy({ ...worker, nutritionProfile: { ...worker.nutritionProfile, workActivity: 'mostly_seated' } })
    expect(result.productionEstimate.status).toBe('estimated')
    if (result.productionEstimate.status !== 'estimated' || seated.status !== 'estimated') throw new Error('Missing production estimate')
    expect(result.productionEstimate.kcalPerDay).toEqual(seated.kcalPerDay)
  })

  it('never chooses a PAL category from steps or uses reference results to change production', () => {
    const inactive = validateStartingEnergy({ ...firstPersona, palScenarios: ['inactive'] })
    const active = validateStartingEnergy({ ...firstPersona, palScenarios: ['very_active'] })
    expect(inactive.productionEstimate).toEqual(active.productionEstimate)
    expect(inactive.eligibility).toEqual(active.eligibility)
    expect(active.palSelection).toBe('explicit_scenarios_not_inferred')
    expect(active.warnings).toContain('reference_divergence_review')
    expect(active.diagnostics).toContainEqual({ code: 'reference_divergence_review', kind: 'large_divergence', severity: 'review' })
    expect(inactive.warnings).not.toContain('reference_divergence_review')
  })

  it('warns on no supplied scenarios without inventing a PAL or blocking production', () => {
    const result = validateStartingEnergy({ ...firstPersona, palScenarios: [] })
    expect(result.referenceEstimates).toEqual([])
    expect(result.comparison).toBeUndefined()
    expect(result.warnings).toEqual(['no_pal_scenarios'])
    expect(result.eligibility.automaticNutritionPlanAllowed).toBe(true)
  })

  it('reports reference unavailability at age 18 without changing production safety rules', () => {
    const result = validateStartingEnergy({ ...firstPersona, nutritionProfile: { ...firstPersona.nutritionProfile, age: 18 } })
    expect(result.productionEstimate.status).toBe('estimated')
    expect(result.comparison).toBeUndefined()
    expect(result.warnings).toContain('reference_estimate_unavailable')
    expect(result.eligibility.automaticNutritionPlanAllowed).toBe(true)
  })

  it.each([
    'pregnancy', 'breastfeeding', 'eating_disorder_risk', 'very_low_body_weight',
    'rapid_unexplained_weight_change', 'medical_condition_or_medication', 'clinician_managed_nutrition',
  ] satisfies NutritionSafetyFlag[])('mathematical EER never grants plan/fat loss eligibility for %s', flag => {
    const result = validateStartingEnergy({
      ...firstPersona, nutritionProfile: { ...firstPersona.nutritionProfile, safetyFlags: [flag] },
    })
    expect(result.referenceEstimates.every(reference => reference.status === 'estimated')).toBe(true)
    expect(result.productionEstimate).toEqual({ status: 'requires_safety_review', reasons: [flag] })
    expect(result.comparison).toBeUndefined()
    expect(result.eligibility).toEqual({ automaticNutritionPlanAllowed: false, automaticFatLossAllowed: false, safetyReasons: [flag] })
    expect(result.warnings).toContain('safety_review_required')
  })

  it('keeps minors blocked and does not extrapolate adult reference equations', () => {
    const result = validateStartingEnergy({ ...firstPersona, nutritionProfile: { ...firstPersona.nutritionProfile, age: 17 } })
    expect(result.productionEstimate.status).toBe('requires_safety_review')
    expect(result.referenceEstimates.every(reference => reference.status === 'unsupported_age')).toBe(true)
    expect(result.eligibility.automaticNutritionPlanAllowed).toBe(false)
    expect(result.eligibility.automaticFatLossAllowed).toBe(false)
  })

  it('invalid production activity does not become eligible just because EER is calculable', () => {
    const result = validateStartingEnergy({ ...firstPersona, nutritionProfile: { ...firstPersona.nutritionProfile, averageStepsPerDay: NaN } })
    expect(result.productionEstimate.status).toBe('invalid_input')
    expect(result.referenceEstimates.every(reference => reference.status === 'estimated')).toBe(true)
    expect(result.eligibility.automaticNutritionPlanAllowed).toBe(false)
    expect(result.eligibility.automaticFatLossAllowed).toBe(false)
    expect(result.warnings).toContain('production_estimate_unavailable')
    expect(result.diagnostics).toContainEqual({ code: 'production_estimate_unavailable', kind: 'inconsistent_scenario', severity: 'invalid' })
  })

  it('distinguishes conflicting strength records from insufficient intensity/step context', () => {
    const result = validateStartingEnergy({ ...firstPersona, trainingActivity: { strengthSessionsPerWeek: 0, estimatedStrengthMinutesPerWeek: 180 } })
    expect(result.diagnostics).toContainEqual({ code: 'inconsistent_activity_inputs', kind: 'inconsistent_scenario', severity: 'review' })
  })
})

describe('reference differences and engineering warnings', () => {
  it('uses the production midpoint and each reference as the percentage denominator', () => {
    const result = compareEnergyReferenceEstimates({ min: 1700, max: 2300 }, [syntheticReference(2500)])
    expect(result).toMatchObject({
      productionMidpointKcalPerDay: 2000,
      differences: [{ signedDifferenceKcal: -500, absoluteDifferenceKcal: 500, percentageDifference: 20 }],
      closestPercentageDifference: 20, divergenceReviewSuggested: false,
    })
  })

  it('warns for large deviations in either direction', () => {
    expect(compareEnergyReferenceEstimates({ min: 500, max: 500 }, [syntheticReference(1000)])?.divergenceReviewSuggested).toBe(true)
    expect(compareEnergyReferenceEstimates({ min: 1500, max: 1500 }, [syntheticReference(1000)])?.divergenceReviewSuggested).toBe(true)
  })

  it('does not warn at exactly 25%, but does above the documented boundary', () => {
    expect(REFERENCE_DIVERGENCE_REVIEW_THRESHOLD_PERCENT).toBe(25)
    expect(compareEnergyReferenceEstimates({ min: 1250, max: 1250 }, [syntheticReference(1000)])?.divergenceReviewSuggested).toBe(false)
    expect(compareEnergyReferenceEstimates({ min: 1251, max: 1251 }, [syntheticReference(1000)])?.divergenceReviewSuggested).toBe(true)
  })

  it('warns only when every explicit scenario is far away, independent of order', () => {
    const references = [syntheticReference(1000), syntheticReference(2000, 'active')]
    const range = { min: 1900, max: 2100 }
    expect(compareEnergyReferenceEstimates(range, references)?.divergenceReviewSuggested).toBe(false)
    expect(compareEnergyReferenceEstimates(range, [...references].reverse())?.closestPercentageDifference).toBe(0)
  })

  it('distinguishes ranges entirely outside the scenarios from touching their envelope', () => {
    const references = [syntheticReference(1000), syntheticReference(2000)]
    expect(compareEnergyReferenceEstimates({ min: 500, max: 999 }, references)?.productionRangePosition).toBe('below_all_predictions')
    expect(compareEnergyReferenceEstimates({ min: 2001, max: 2500 }, references)?.productionRangePosition).toBe('above_all_predictions')
    expect(compareEnergyReferenceEstimates({ min: 500, max: 1000 }, references)?.productionRangePosition).toBe('overlaps_prediction_span')
  })

  it('does not produce misleading percentages for absent or invalid reference/range inputs', () => {
    expect(compareEnergyReferenceEstimates({ min: 1000, max: 2000 }, [])).toBeUndefined()
    expect(compareEnergyReferenceEstimates({ min: 1000, max: 2000 }, [syntheticReference(0)])).toBeUndefined()
    expect(compareEnergyReferenceEstimates({ min: 2000, max: 1000 }, [syntheticReference(1500)])).toBeUndefined()
    expect(compareEnergyReferenceEstimates({ min: NaN, max: 2000 }, [syntheticReference(1500)])).toBeUndefined()
    expect(compareEnergyReferenceEstimates({ min: -100, max: 2000 }, [syntheticReference(1500)])).toBeUndefined()
    expect(compareEnergyReferenceEstimates({ min: 1000, max: Infinity }, [syntheticReference(1500)])).toBeUndefined()
    expect(compareEnergyReferenceEstimates({ min: 1000, max: 2000 }, [syntheticReference(NaN)])).toBeUndefined()
    expect(compareEnergyReferenceEstimates({ min: 1e308, max: 1e308 }, [syntheticReference(1e-308)])).toBeUndefined()
  })

  it('rejects reference metadata pairing a PA category with another category PAL range', () => {
    const wrongCategory = { ...syntheticReference(2000), palCategory: 'active' as const }
    expect(compareEnergyReferenceEstimates({ min: 1700, max: 2300 }, [wrongCategory])).toBeUndefined()
  })

  it('keeps a range above a nearby population prediction informational', () => {
    const result = compareEnergyReferenceEstimates({ min: 2001, max: 2050 }, [syntheticReference(2000)])
    expect(result?.productionRangePosition).toBe('above_all_predictions')
    expect(result?.divergenceReviewSuggested).toBe(false)
  })
})
