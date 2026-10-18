import type {
  SessionFeeling,
  SessionSymptom,
  SleepQuality,
} from './session'

export type CoachMemory = {
  analyzedSessions: number

  feelingCounts: Record<
    SessionFeeling,
    number
  >

  sleepCounts: Record<
    SleepQuality | 'not_provided',
    number
  >

  symptomCounts: Record<
    SessionSymptom,
    number
  >

  adaptation: {
    offered: number
    accepted: number
    declined: number
    shortened: number
  }
}
