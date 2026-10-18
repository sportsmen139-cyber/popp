import type { CoachMemory } from '../../types/coachMemory'
import type { WorkoutSessionResult } from '../../types/workoutSession'

export function buildCoachMemory(
  workoutHistory: WorkoutSessionResult[],
): CoachMemory {
  const memory: CoachMemory = {
    analyzedSessions: 0,

    feelingCounts: {
      great: 0,
      normal: 0,
      tired: 0,
      poor: 0,
    },

    sleepCounts: {
      good: 0,
      normal: 0,
      poor: 0,
      not_provided: 0,
    },

    symptomCounts: {
      pain_or_discomfort: 0,
      cramps: 0,
      low_energy: 0,
      headache: 0,
      bloating: 0,
      other: 0,
    },

    adaptation: {
      offered: 0,
      accepted: 0,
      declined: 0,
      shortened: 0,
    },
  }

  for (const session of workoutHistory) {
    const context = session.sessionContext

    if (!context) {
      continue
    }

    memory.analyzedSessions += 1

    memory.feelingCounts[
      context.checkIn.feeling
    ] += 1

    const sleep =
      context.checkIn.sleepQuality ??
      'not_provided'

    memory.sleepCounts[sleep] += 1

    for (const symptom of context.checkIn.symptoms) {
      memory.symptomCounts[symptom] += 1
    }

    if (context.adaptation.offered) {
      memory.adaptation.offered += 1

      if (context.adaptation.accepted) {
        memory.adaptation.accepted += 1
      } else {
        memory.adaptation.declined += 1
      }
    }

    if (
      context.adaptation.accepted &&
      context.adaptation.actions.includes(
        'shorten_session',
      )
    ) {
      memory.adaptation.shortened += 1
    }
  }

  return memory
}
