import { describe, expect, it } from 'vitest'
import type { NutritionSafetyFlag } from '../../../types/nutrition'
import type { Dri2023AdultEerEstimate } from '../../../types/nutritionEnergyValidation'
import { estimateStartingEnergy } from '../estimateStartingEnergy'
import {
  compareEnergyReferenceEstimates,
  ENERGY_REFERENCE_WARNING_THRESHOLD_PERCENT,
  validateStartingEnergy,
} from './validateStartingEnergy'
import { ENERGY_VALIDATION_PERSONAS } from './validationPersonas.fixtures'

const firstPersona = ENERGY_VALIDATION_PERSONAS[0]

function syntheticReference(kcalPerDay: number): Dri2023AdultEerEstimate {
  return { status: 'estimated', method: 'dri_2023_adult_eer', sourceDoi: '10.17226/26818', palCategory: 'inactive', kcalPerDay }
}

describe('starting energy reference validation', () => {
  it.each(ENERGY_VALIDATION_PERSONAS)('checks $id against explicitly chosen DRI scenarios', persona => {
    const result = validateStartingEnergy(persona)
    expect(result.productionEstimate.status).toBe('estimated')
    expect(result.referenceEstimates).toHaveLength(persona.palScenarios.length)
    expect(result.referenceEstimates.every(reference => reference.status === 'estimated')).toBe(true)
    expect(result.comparison).toBeDefined()
    expect(result.comparison?.differences.map(item => item.palCategory)).toEqual(persona.palScenarios)
    // A broad, named engineering guardrail; never equality to DRI or a medical
    // accuracy claim. A severe shift against ALL plausible scenarios must fail.
    expect(result.comparison?.closestPercentageDifference).toBeLessThanOrEqual(ENERGY_REFERENCE_WARNING_THRESHOLD_PERCENT)
    expect(result.warnings).not.toContain('large_reference_discrepancy')
    expect(result.productionEstimate).toEqual(estimateStartingEnergy(persona))
  })

  it('retains low completeness for missing steps rather than using reference to fill them', () => {
    const result = validateStartingEnergy(ENERGY_VALIDATION_PERSONAS[5])
    expect(result.productionEstimate).toMatchObject({ status: 'estimated', dataCompleteness: { level: 'low' }, confidence: 'low' })
  })

  it('makes the low production-range finding visible even below the 25% midpoint warning threshold', () => {
    const result = validateStartingEnergy(firstPersona)
    expect(result.warnings).toContain('production_range_below_reference_scenarios')
    expect(result.warnings).not.toContain('large_reference_discrepancy')
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
    expect(active.warnings).toContain('large_reference_discrepancy')
    expect(inactive.warnings).not.toContain('large_reference_discrepancy')
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
  })
})

describe('reference differences and engineering warnings', () => {
  it('uses the production midpoint and each reference as the percentage denominator', () => {
    const result = compareEnergyReferenceEstimates({ min: 1700, max: 2300 }, [syntheticReference(2500)])
    expect(result).toMatchObject({
      productionMidpointKcalPerDay: 2000,
      differences: [{ signedDifferenceKcal: -500, absoluteDifferenceKcal: 500, percentageDifference: 20 }],
      closestPercentageDifference: 20, largeDiscrepancy: false,
    })
  })

  it('warns for large deviations in either direction', () => {
    expect(compareEnergyReferenceEstimates({ min: 500, max: 500 }, [syntheticReference(1000)])?.largeDiscrepancy).toBe(true)
    expect(compareEnergyReferenceEstimates({ min: 1500, max: 1500 }, [syntheticReference(1000)])?.largeDiscrepancy).toBe(true)
  })

  it('does not warn at exactly 25%, but does above the documented boundary', () => {
    expect(compareEnergyReferenceEstimates({ min: 1250, max: 1250 }, [syntheticReference(1000)])?.largeDiscrepancy).toBe(false)
    expect(compareEnergyReferenceEstimates({ min: 1251, max: 1251 }, [syntheticReference(1000)])?.largeDiscrepancy).toBe(true)
  })

  it('warns only when every explicit scenario is far away, independent of order', () => {
    const references = [syntheticReference(1000), { ...syntheticReference(2000), palCategory: 'active' as const }]
    const range = { min: 1900, max: 2100 }
    expect(compareEnergyReferenceEstimates(range, references)?.largeDiscrepancy).toBe(false)
    expect(compareEnergyReferenceEstimates(range, [...references].reverse())?.closestPercentageDifference).toBe(0)
  })

  it('distinguishes ranges entirely outside the scenarios from touching their envelope', () => {
    const references = [syntheticReference(1000), syntheticReference(2000)]
    expect(compareEnergyReferenceEstimates({ min: 500, max: 999 }, references)?.productionRangePosition).toBe('below_all_scenarios')
    expect(compareEnergyReferenceEstimates({ min: 2001, max: 2500 }, references)?.productionRangePosition).toBe('above_all_scenarios')
    expect(compareEnergyReferenceEstimates({ min: 500, max: 1000 }, references)?.productionRangePosition).toBe('overlaps_scenario_envelope')
  })

  it('does not produce misleading percentages for absent or invalid reference/range inputs', () => {
    expect(compareEnergyReferenceEstimates({ min: 1000, max: 2000 }, [])).toBeUndefined()
    expect(compareEnergyReferenceEstimates({ min: 1000, max: 2000 }, [syntheticReference(0)])).toBeUndefined()
    expect(compareEnergyReferenceEstimates({ min: 2000, max: 1000 }, [syntheticReference(1500)])).toBeUndefined()
  })
})
