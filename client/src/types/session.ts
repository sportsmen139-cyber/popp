export type SessionFeeling =
  | 'great'
  | 'normal'
  | 'tired'
  | 'poor'

export type SessionSymptom =
  | 'pain_or_discomfort'
  | 'cramps'
  | 'low_energy'
  | 'headache'
  | 'bloating'
  | 'other'

export type SleepQuality =
  | 'good'
  | 'normal'
  | 'poor'

export type SessionCheckIn = {
  feeling: SessionFeeling

  sleepQuality?: SleepQuality

  hasTrainingIssue: boolean

  symptoms: SessionSymptom[]

  availableMinutes?: number

  notes?: string
}