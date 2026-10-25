import { describe, expect, it } from 'vitest'
import type { NutritionProfile } from '../../types/nutrition'
import type { StartingEnergyEstimate } from '../../types/nutritionEnergy'
import type { TrainingActivityInput } from './buildActivityProfile'
import { estimateStartingEnergy } from './estimateStartingEnergy'

const profile: NutritionProfile = {
  mode: 'simple', goal: 'maintenance', age: 30,
  heightCm: 175, weightKg: 75, rmrCalculationCategory: 'male',
  averageStepsPerDay: 3000, workActivity: 'mostly_seated',
  cardioMinutesPerWeek: 0, otherActivityMinutesPerWeek: 0, safetyFlags: [],
}
const noTraining: TrainingActivityInput = {
  strengthSessionsPerWeek: 0, estimatedStrengthMinutesPerWeek: 0,
}
const regularTraining: TrainingActivityInput = {
  strengthSessionsPerWeek: 3, estimatedStrengthMinutesPerWeek: 180,
}

function estimate(
  overrides: Partial<NutritionProfile> = {},
  trainingActivity = noTraining,
): StartingEnergyEstimate {
  const result = estimateStartingEnergy({
    nutritionProfile: { ...profile, ...overrides }, trainingActivity,
  })
  if (result.status !== 'estimated') throw new Error(`Unexpected result: ${result.status}`)
  return result
}

describe('estimateStartingEnergy', () => {
  it('solves the TEF energy balance instead of adding a percentage of pre-TEF energy', () => {
    const result = estimate({}, regularTraining)
    const raw = result.components.energyBeforeRoundingKcalPerDay
    const tef = result.components.thermicEffectFraction
    const activity = result.components.combinedActivityKcalPerDay
    // E - TEF*E = RMR scenario + net activity. A multiply-by-(1+TEF)
    // implementation does not satisfy this identity.
    expect(raw.min * (1 - tef.min)).toBeCloseTo(result.rmr.kcalPerDay * 0.9 + activity.min, 8)
    expect(raw.max * (1 - tef.max)).toBeCloseTo(result.rmr.kcalPerDay * 1.1 + activity.max, 8)
    expect(tef).toEqual({ min: 0.08, max: 0.12 })
    expect(result.kcalPerDay.min).toBeLessThanOrEqual(raw.min)
    expect(result.kcalPerDay.max).toBeGreaterThanOrEqual(raw.max)
    expect(raw.min - result.kcalPerDay.min).toBeLessThan(50)
    expect(result.kcalPerDay.max - raw.max).toBeLessThan(50)
  })

  it('exposes default net MET assumptions without claiming personal intensity', () => {
    expect(estimate({}, regularTraining).components.assumedStructuredNetMet).toEqual({
      source: 'beta_defaults_not_reported_intensity',
      strength: { min: 2, max: 4 }, cardio: { min: 3, max: 7 }, other: { min: 1, max: 4 },
    })
  })

  it('returns a broad starting maintenance range for low activity, not a calorie prescription', () => {
    const result = estimate()
    expect(result).toMatchObject({
      status: 'estimated', kind: 'estimated_maintenance',
      method: 'activity_envelope_beta', modelVersion: 'beta_1',
      kcalPerDay: { min: 1700, max: 2300 }, confidence: 'low',
      rmr: { kcalPerDay: 1699 },
      dataCompleteness: { level: 'high', missingFields: [], issues: [] },
      components: {
        dailyActivityKcalPerDay: { min: 75, max: 150 },
        structuredActivityKcalPerDay: { min: 0, max: 0 },
        combinedActivityKcalPerDay: { min: 75, max: 150 },
      },
    })
    expect(result.reasons).toContain('no_structured_activity_reported')
    expect(result.limitations).toContain('beta_heuristic_not_measured_tdee')
    expect(result.limitations).toContain('not_individually_calibrated')
    expect(result.limitations).not.toContain('activity_overlap_unknown')
    expect(result).not.toHaveProperty('calorieTarget')
  })

  it('reflects moderate and high raw activity instead of a summary multiplier', () => {
    const low = estimate()
    const moderate = estimate({ averageStepsPerDay: 8000, workActivity: 'mixed' }, regularTraining)
    const high = estimate({ averageStepsPerDay: 14000, cardioMinutesPerWeek: 120 }, {
      strengthSessionsPerWeek: 4, estimatedStrengthMinutesPerWeek: 240,
    })
    expect(moderate.kcalPerDay).toEqual({ min: 1850, max: 2650 })
    expect(moderate.kcalPerDay.min).toBeGreaterThan(low.kcalPerDay.min)
    expect(moderate.kcalPerDay.max).toBeGreaterThan(low.kcalPerDay.max)
    expect(high.kcalPerDay.min).toBeGreaterThan(moderate.kcalPerDay.min)
    expect(high.kcalPerDay.max).toBeGreaterThan(moderate.kcalPerDay.max)
    expect(high.confidence).toBe('low')
  })

  it('does not add physical work on top of high steps describing the same movement', () => {
    const seated = estimate({ averageStepsPerDay: 12000 }, regularTraining)
    const physicalWork = estimate({ averageStepsPerDay: 12000, workActivity: 'physically_active' }, regularTraining)
    expect(physicalWork.components.dailyActivityKcalPerDay).toEqual({ min: 270, max: 450 })
    expect(physicalWork.kcalPerDay).toEqual(seated.kcalPerDay)
    expect(physicalWork.reasons).toContain('steps_and_work_combined_by_maximum')
  })

  it('uses work as a floor when step coverage may be incomplete', () => {
    const result = estimate({ averageStepsPerDay: 2000, workActivity: 'physically_active' })
    expect(result.components.dailyActivityKcalPerDay).toEqual({ min: 225, max: 450 })
    expect(result.dataCompleteness).toMatchObject({
      level: 'medium', issues: ['low_steps_with_physical_work'],
    })
    expect(result.limitations).toContain('activity_signals_need_review')
  })

  it('still estimates without steps, using work with low starting data completeness', () => {
    const result = estimate({ averageStepsPerDay: undefined, workActivity: 'mixed' }, regularTraining)
    expect(result.kcalPerDay.min).toBeGreaterThan(0)
    expect(result.kcalPerDay.max).toBeGreaterThan(result.kcalPerDay.min)
    expect(result.dataCompleteness).toEqual({
      level: 'low', missingFields: ['averageStepsPerDay'], issues: [],
    })
    expect(result.reasons).toContain('work_used_without_steps')
    expect(result.limitations).toContain('missing_activity_data')
    expect(result.confidence).toBe('low')
  })

  it('distinguishes unreported optional activity from an explicit zero', () => {
    const result = estimate({ cardioMinutesPerWeek: undefined, otherActivityMinutesPerWeek: undefined })
    expect(result.dataCompleteness).toEqual({
      level: 'medium', missingFields: ['cardioMinutesPerWeek', 'otherActivityMinutesPerWeek'], issues: [],
    })
    expect(result.activity.cardioMinutesPerWeek).toBe(0)
    expect(result.activity.dataAvailability?.cardioMinutesPerWeek).toBe('missing')
    expect(estimate().dataCompleteness.level).toBe('high')
    expect(estimate().confidence).toBe('low')
  })

  it('envelopes overlap with steps and between structured categories instead of assuming independence', () => {
    const result = estimate({
      averageStepsPerDay: 12000, cardioMinutesPerWeek: 180, otherActivityMinutesPerWeek: 180,
    }, regularTraining)
    // Lower bound allows cardio/strength/other to be the same session. Upper
    // bound allows distinct sessions. Neither case is asserted as observed fact.
    expect(result.components.structuredActivityKcalPerDay.min).toBeCloseTo(96.43, 2)
    expect(result.components.structuredActivityKcalPerDay.max).toBeCloseTo(482.14, 2)
    expect(result.components.combinedActivityKcalPerDay.min).toBe(270)
    expect(result.components.combinedActivityKcalPerDay.max).toBeCloseTo(932.14, 2)
    expect(result.reasons).toContain('structured_activity_overlap_envelope')
    expect(result.limitations).toContain('activity_overlap_unknown')
  })

  it('does not charge again for session count when total training time is unchanged', () => {
    expect(estimate({}, regularTraining).kcalPerDay).toEqual(estimate({}, {
      strengthSessionsPerWeek: 6, estimatedStrengthMinutesPerWeek: 180,
    }).kcalPerDay)
  })

  it.each([
    [{ strengthSessionsPerWeek: 3, estimatedStrengthMinutesPerWeek: 0 }, 'strength_duration_missing'],
    [{ strengthSessionsPerWeek: 0, estimatedStrengthMinutesPerWeek: 180 }, 'strength_sessions_missing'],
  ] as const)('reports inconsistent session/time inputs rather than inventing duration: %j', (training, issue) => {
    const result = estimate({}, training)
    expect(result.dataCompleteness.level).toBe('medium')
    expect(result.dataCompleteness.issues).toContain(issue)
    expect(result.limitations).toContain('activity_signals_need_review')
  })

  it('uses raw steps even when two profiles have the same summary level', () => {
    const first = estimate({ averageStepsPerDay: 7000 })
    const second = estimate({ averageStepsPerDay: 9999 })
    expect(first.activity.level).toBe(second.activity.level)
    expect(second.kcalPerDay.min).toBeGreaterThan(first.kcalPerDay.min)
    expect(second.kcalPerDay.max).toBeGreaterThan(first.kcalPerDay.max)
  })

  it('keeps maintenance independent of nutrition goal and tracking mode', () => {
    const first = estimate({}, regularTraining)
    const second = estimate({ goal: 'fat_loss', mode: 'tracking' }, regularTraining)
    expect(second).toEqual(first)
  })

  it.each([
    { age: 17 }, { safetyFlags: ['pregnancy'] },
    { safetyFlags: ['medical_condition_or_medication'] },
  ] satisfies Partial<NutritionProfile>[])('cannot bypass safety through activity inputs: %j', (overrides) => {
    const result = estimateStartingEnergy({ nutritionProfile: { ...profile, ...overrides }, trainingActivity: regularTraining })
    expect(result.status).toBe('requires_safety_review')
    expect(result).not.toHaveProperty('kcalPerDay')
    expect(result).not.toHaveProperty('rmr')
    if (result.status === 'requires_safety_review') {
      expect(result.reasons).toEqual(overrides.age ? ['under_18'] : overrides.safetyFlags)
    }
  })

  it.each([0, NaN, Infinity])('propagates invalid RMR prerequisites: weight %s', (weightKg) => {
    expect(estimateStartingEnergy({ nutritionProfile: { ...profile, weightKg }, trainingActivity: noTraining })).toEqual({
      status: 'invalid_input', fields: ['weightKg'],
    })
  })

  it('does not use a positive raw RMR that was rounded down to zero', () => {
    expect(estimateStartingEnergy({
      nutritionProfile: { ...profile, heightCm: 20, weightKg: 2.01 }, trainingActivity: noTraining,
    })).toEqual({ status: 'invalid_input', fields: ['rmr.kcalPerDay'] })
  })

  it.each([
    ['averageStepsPerDay', -1], ['averageStepsPerDay', NaN], ['averageStepsPerDay', Infinity],
    ['cardioMinutesPerWeek', -1], ['cardioMinutesPerWeek', Infinity],
    ['otherActivityMinutesPerWeek', NaN], ['otherActivityMinutesPerWeek', -1],
  ] as const)('rejects invalid %s = %s', (field, value) => {
    expect(estimateStartingEnergy({ nutritionProfile: { ...profile, [field]: value }, trainingActivity: noTraining })).toEqual({
      status: 'invalid_input', fields: [field],
    })
  })

  it.each([
    ['strengthSessionsPerWeek', -1], ['strengthSessionsPerWeek', 1.5],
    ['strengthSessionsPerWeek', Infinity],
    ['estimatedStrengthMinutesPerWeek', -1], ['estimatedStrengthMinutesPerWeek', NaN],
  ] as const)('rejects invalid training %s = %s', (field, value) => {
    expect(estimateStartingEnergy({ nutritionProfile: profile, trainingActivity: { ...noTraining, [field]: value } })).toEqual({
      status: 'invalid_input', fields: [field],
    })
  })

  it('rejects an unknown work category from persisted data', () => {
    const invalid = { ...profile, workActivity: 'unknown' } as unknown as NutritionProfile
    expect(estimateStartingEnergy({ nutritionProfile: invalid, trainingActivity: noTraining })).toEqual({
      status: 'invalid_input', fields: ['workActivity'],
    })
  })

  it('rejects impossible weekly duration totals', () => {
    expect(estimateStartingEnergy({
      nutritionProfile: { ...profile, cardioMinutesPerWeek: 10000, otherActivityMinutesPerWeek: 100 },
      trainingActivity: noTraining,
    })).toEqual({ status: 'invalid_input', fields: ['totalStructuredMinutesPerWeek'] })
  })

  it('accepts explicit zero steps and fractional daily step averages', () => {
    expect(estimate({ averageStepsPerDay: 0 }).dataCompleteness.level).toBe('high')
    expect(estimate({ averageStepsPerDay: 8000.5 }).activity.averageStepsPerDay).toBe(8000.5)
  })

  it('accepts the adult boundary at age 18', () => {
    expect(estimate({ age: 18 }).status).toBe('estimated')
  })

  it('rejects arithmetic overflow instead of returning an infinite energy range', () => {
    expect(estimateStartingEnergy({
      nutritionProfile: { ...profile, weightKg: 1.5e307 }, trainingActivity: noTraining,
    })).toEqual({ status: 'invalid_input', fields: ['energy_range'] })
  })

  it('does not introduce energy jumps at the activity summary step thresholds', () => {
    for (const threshold of [4000, 7000, 10000]) {
      const before = estimate({ averageStepsPerDay: threshold - 1 })
      const after = estimate({ averageStepsPerDay: threshold })
      expect(after.kcalPerDay.min - before.kcalPerDay.min).toBeLessThanOrEqual(50)
      expect(after.kcalPerDay.max - before.kcalPerDay.max).toBeLessThanOrEqual(50)
      expect(after.kcalPerDay.min).toBeGreaterThanOrEqual(before.kcalPerDay.min)
      expect(after.kcalPerDay.max).toBeGreaterThanOrEqual(before.kcalPerDay.max)
    }
  })

  it('is deterministic and leaves both profile and training data unchanged', () => {
    const input = structuredClone({ nutritionProfile: profile, trainingActivity: regularTraining })
    const before = structuredClone(input)
    expect(estimateStartingEnergy(input)).toEqual(estimateStartingEnergy(input))
    expect(input).toEqual(before)
  })
})
