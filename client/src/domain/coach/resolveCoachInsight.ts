import type { CoachMemory } from '../../types/coachMemory'

export type CoachInsight = {
  id: 'frequent_fatigue'
  title: string
  message: string
}

const MINIMUM_SESSIONS = 5
const FATIGUE_RATIO_THRESHOLD = 0.6

export function resolveCoachInsight(
  memory: CoachMemory,
): CoachInsight | null {
  if (
    memory.analyzedSessions <
    MINIMUM_SESSIONS
  ) {
    return null
  }

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
    return {
      id: 'frequent_fatigue',
      title: 'Замечаю частую усталость',
      message:
        'В большинстве сохранённых тренировок ты отмечал усталость или плохое самочувствие. Я буду учитывать этот паттерн при дальнейшей адаптации нагрузки.',
    }
  }

  return null
}
