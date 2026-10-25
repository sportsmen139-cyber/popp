import type {
  WorkActivityLevel,
} from './nutrition'

export type ActivityProfileLevel =
  | 'low'
  | 'moderate'
  | 'high'
  | 'very_high'

export type ActivityProfile = {
  /** Qualitative summary only, not a PAL or an energy multiplier. */
  level: ActivityProfileLevel

  averageStepsPerDay?: number

  workActivity:
    WorkActivityLevel

  strengthSessionsPerWeek: number

  estimatedStrengthMinutesPerWeek: number

  cardioMinutesPerWeek: number

  otherActivityMinutesPerWeek: number

  /** Optional for compatibility with previously built profiles. Missing is unknown. */
  dataAvailability?: {
    cardioMinutesPerWeek: 'reported' | 'missing'
    otherActivityMinutesPerWeek: 'reported' | 'missing'
  }
}
