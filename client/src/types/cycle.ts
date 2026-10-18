export type HormonalContraceptionStatus =
  | 'yes'
  | 'no'
  | 'prefer_not_to_say'

export type MenstrualCycleSettings = {
  enabled: boolean

  cycleStartDates: string[]

  typicalCycleLengthDays?: number

  irregularCycle: boolean

  hormonalContraception:
    HormonalContraceptionStatus
}