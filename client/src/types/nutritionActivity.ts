import type {
  WorkActivityLevel,
} from './nutrition'

export type ActivityProfileLevel =
  | 'low'
  | 'moderate'
  | 'high'
  | 'very_high'

export type ActivityProfile = {
  level: ActivityProfileLevel

  averageStepsPerDay?: number

  workActivity:
    WorkActivityLevel

  strengthSessionsPerWeek: number

  estimatedStrengthMinutesPerWeek: number

  cardioMinutesPerWeek: number

  otherActivityMinutesPerWeek: number
}
