import type { NutritionProfile } from '../../types/nutrition'
import type { ActivityProfile } from '../../types/nutritionActivity'
import type {
  NutritionRange,
  StartingActivityDataCompleteness,
  StartingEnergyEstimateResult,
  StartingEnergyInvalidField,
  StartingEnergyLimitation,
} from '../../types/nutritionEnergy'
import { buildActivityProfile } from './buildActivityProfile'
import type { TrainingActivityInput } from './buildActivityProfile'
import { estimateRmr } from './estimateRmr'
import { STARTING_ENERGY_MODEL as MODEL } from './startingEnergyModel'

type EstimateStartingEnergyInput = {
  nutritionProfile: NutritionProfile
  trainingActivity: TrainingActivityInput
}

function validateActivityInputs({
  nutritionProfile: profile,
  trainingActivity: training,
}: EstimateStartingEnergyInput): StartingEnergyInvalidField[] {
  const fields: StartingEnergyInvalidField[] = []

  for (const field of ['averageStepsPerDay', 'cardioMinutesPerWeek', 'otherActivityMinutesPerWeek'] as const) {
    const value = profile[field]
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      fields.push(field)
    }
  }
  if (!Number.isSafeInteger(training.strengthSessionsPerWeek) || training.strengthSessionsPerWeek < 0) {
    fields.push('strengthSessionsPerWeek')
  }
  if (!Number.isFinite(training.estimatedStrengthMinutesPerWeek) || training.estimatedStrengthMinutesPerWeek < 0) {
    fields.push('estimatedStrengthMinutesPerWeek')
  }
  if (!Object.hasOwn(MODEL.workKcalPerKgPerDay, profile.workActivity)) {
    fields.push('workActivity')
  }

  // Reject impossible totals instead of silently capping or normalizing inputs.
  if (fields.length === 0) {
    const totalMinutes = training.estimatedStrengthMinutesPerWeek +
      (profile.cardioMinutesPerWeek ?? 0) + (profile.otherActivityMinutesPerWeek ?? 0)
    const minutesInWeek = MODEL.daysPerWeek * MODEL.hoursPerDay * MODEL.minutesPerHour
    if (totalMinutes > minutesInWeek) fields.push('totalStructuredMinutesPerWeek')
  }
  return fields
}

function resolveDataCompleteness(activity: ActivityProfile): StartingActivityDataCompleteness {
  const missingFields: StartingActivityDataCompleteness['missingFields'] = []
  const issues: StartingActivityDataCompleteness['issues'] = []
  if (activity.averageStepsPerDay === undefined) missingFields.push('averageStepsPerDay')
  for (const field of ['cardioMinutesPerWeek', 'otherActivityMinutesPerWeek'] as const) {
    if (activity.dataAvailability?.[field] !== 'reported') missingFields.push(field)
  }
  if (activity.strengthSessionsPerWeek > 0 && activity.estimatedStrengthMinutesPerWeek === 0) {
    issues.push('strength_duration_missing')
  }
  if (activity.strengthSessionsPerWeek === 0 && activity.estimatedStrengthMinutesPerWeek > 0) {
    issues.push('strength_sessions_missing')
  }
  if (
    activity.averageStepsPerDay !== undefined &&
    activity.averageStepsPerDay < MODEL.lowStepsThreshold &&
    activity.workActivity === 'physically_active'
  ) {
    // May be non-stepping work or incomplete step coverage; do not invent a cause.
    issues.push('low_steps_with_physical_work')
  }
  const level = activity.averageStepsPerDay === undefined ? 'low'
    : missingFields.length > 0 || issues.length > 0 ? 'medium' : 'high'
  return { level, missingFields, issues }
}

function resolveActivityComponents(activity: ActivityProfile, weightKg: number) {
  const work = MODEL.workKcalPerKgPerDay[activity.workActivity]
  const steps = activity.averageStepsPerDay
  const daily: NutritionRange = {
    min: weightKg * Math.max(work.min, (steps ?? 0) * MODEL.stepKcalPerKg.min),
    max: weightKg * Math.max(work.max, (steps ?? 0) * MODEL.stepKcalPerKg.max),
  }

  function structuredCost(bound: 'min' | 'max'): number {
    const costs = [
      activity.estimatedStrengthMinutesPerWeek * MODEL.structuredNetMet.strength[bound],
      activity.cardioMinutesPerWeek * MODEL.structuredNetMet.cardio[bound],
      activity.otherActivityMinutesPerWeek * MODEL.structuredNetMet.other[bound]
    ]
    // Categories may also describe the same session (e.g. circuit + cardio).
    const netMetMinutes = bound === 'min' ? Math.max(...costs) : costs.reduce((sum, cost) => sum + cost, 0)
    return weightKg * netMetMinutes / MODEL.minutesPerHour / MODEL.daysPerWeek
  }
  const structured = { min: structuredCost('min'), max: structuredCost('max') }
  return {
    dailyActivityKcalPerDay: daily,
    structuredActivityKcalPerDay: structured,
    combinedActivityKcalPerDay: {
      // Unknown overlap: full inclusion at the lower bound, disjoint at the upper.
      // Strength session count is context only, never an extra calorie term.
      min: Math.max(daily.min, structured.min),
      max: daily.max + structured.max,
    },
  }
}

/**
 * Derives RMR and ActivityProfile from the same inputs to avoid stale/mismatched
 * estimates and safety bypass through an externally supplied RMR. No goal
 * adjustment, calorie prescription or calibrated expenditure is produced.
 */
export function estimateStartingEnergy(input: EstimateStartingEnergyInput): StartingEnergyEstimateResult {
  const rmr = estimateRmr(input.nutritionProfile)
  if (rmr.status !== 'estimated') return rmr
  // Also guards the edge case of a tiny positive RMR rounded to zero upstream.
  if (!Number.isFinite(rmr.kcalPerDay) || rmr.kcalPerDay <= 0) {
    return { status: 'invalid_input', fields: ['rmr.kcalPerDay'] }
  }
  const fields = validateActivityInputs(input)
  if (fields.length > 0) return { status: 'invalid_input', fields }

  const activity = buildActivityProfile(input)
  const dataCompleteness = resolveDataCompleteness(activity)
  const components = resolveActivityComponents(activity, input.nutritionProfile.weightKg)
  const combined = components.combinedActivityKcalPerDay
  const lower = (rmr.kcalPerDay * (1 - MODEL.rmrUncertaintyFraction) + combined.min) /
    (1 - MODEL.thermicEffectFraction.min)
  const upper = (rmr.kcalPerDay * (1 + MODEL.rmrUncertaintyFraction) + combined.max) /
    (1 - MODEL.thermicEffectFraction.max)
  const kcalPerDay = {
    min: Math.floor(lower / MODEL.roundingKcal) * MODEL.roundingKcal,
    max: Math.ceil(upper / MODEL.roundingKcal) * MODEL.roundingKcal,
  }
  if (!Number.isFinite(kcalPerDay.max) || kcalPerDay.min <= 0) {
    return { status: 'invalid_input', fields: ['energy_range'] }
  }

  const hasStructuredActivity = components.structuredActivityKcalPerDay.max > 0
  const limitations: StartingEnergyLimitation[] = [
    'beta_heuristic_not_measured_tdee',
    'not_individually_calibrated',
    'activity_intensity_and_work_duration_unknown',
  ]
  if (hasStructuredActivity) limitations.push('activity_overlap_unknown')
  if (dataCompleteness.missingFields.length > 0) limitations.push('missing_activity_data')
  if (dataCompleteness.issues.length > 0) limitations.push('activity_signals_need_review')

  return {
    status: 'estimated', kind: 'estimated_maintenance',
    method: 'activity_envelope_beta', modelVersion: 'beta_1',
    rmr, activity, kcalPerDay, confidence: 'low', dataCompleteness,
    components: {
      ...components,
      assumedStructuredNetMet: {
        source: 'beta_defaults_not_reported_intensity',
        strength: { ...MODEL.structuredNetMet.strength },
        cardio: { ...MODEL.structuredNetMet.cardio },
        other: { ...MODEL.structuredNetMet.other },
      },
      thermicEffectFraction: { ...MODEL.thermicEffectFraction },
      energyBeforeRoundingKcalPerDay: { min: lower, max: upper },
    },
    limitations,
    reasons: [
      activity.averageStepsPerDay === undefined
        ? 'work_used_without_steps' : 'steps_and_work_combined_by_maximum',
      hasStructuredActivity ? 'structured_activity_overlap_envelope' : 'no_structured_activity_reported',
    ],
  }
}
