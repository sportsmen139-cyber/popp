import type { CoachMemory } from '../../types/coachMemory'

export type CoachInsight = {
  id:
    | 'frequent_fatigue'
    | 'frequent_poor_sleep'

  title: string
  message: string
}

const MINIMUM_SESSIONS = 5

const FATIGUE_RATIO_THRESHOLD = 0.6

const MINIMUM_SLEEP_OBSERVATIONS = 4
const POOR_SLEEP_RATIO_THRESHOLD = 0.5

export function resolveCoachInsights(
  memory: CoachMemory,
): CoachInsight[] {
  if (
    memory.analyzedSessions <
    MINIMUM_SESSIONS
  ) {
    return []
  }

  const insights: CoachInsight[] = []

  const fatigueSessions =
    memory.feelingCounts.tired +
    memory.feelingCounts.poor

  const fatigueRatio =
    fatigueSessions /
    memory.analyzedSessions

  if (
    fatigueRatio >=
    FATIGUE_RATIO_THRESHOLD
  ) {
    insights.push({
      id: 'frequent_fatigue',
      title: 'Замечаю частую усталость',
      message:
        'В большинстве последних тренировок ты отмечал усталость или плохое самочувствие. Этот паттерн стоит учитывать при оценке нагрузки.',
    })
  }

  const recordedSleepSessions =
    memory.sleepCounts.good +
    memory.sleepCounts.normal +
    memory.sleepCounts.poor

  if (
    recordedSleepSessions >=
    MINIMUM_SLEEP_OBSERVATIONS
  ) {
    const poorSleepRatio =
      memory.sleepCounts.poor /
      recordedSleepSessions

    if (
      poorSleepRatio >=
      POOR_SLEEP_RATIO_THRESHOLD
    ) {
      insights.push({
        id: 'frequent_poor_sleep',
        title: 'Сон часто был плохим',
        message:
          'В половине или более последних тренировок, где ты указал качество сна, сон был плохим. Это стоит учитывать вместе с текущим самочувствием.',
      })
    }
  }

  return insights
}
