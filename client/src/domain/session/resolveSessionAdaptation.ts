import type {
  SessionCheckIn,
} from '../../types/session'

import type {
  SessionAdaptation,
  SessionAdaptationAction,
} from '../../types/sessionAdaptation'

export function resolveSessionAdaptation(
  checkIn: SessionCheckIn,
  plannedMinutes?: number,
): SessionAdaptation {
  const actions =
    new Set<SessionAdaptationAction>()

  const reasons: string[] = []

  const hasSymptoms =
    checkIn.hasTrainingIssue &&
    checkIn.symptoms.length > 0

  const hasPoorSleep =
    checkIn.sleepQuality === 'poor'

  const needsStrongerAdaptation =
    checkIn.feeling === 'poor' ||
    (
      checkIn.feeling === 'tired' &&
      hasPoorSleep
    ) ||
    (
      hasSymptoms &&
      hasPoorSleep
    ) ||
    (
      checkIn.hasTrainingIssue &&
      checkIn.symptoms.length >= 2
    )

  const needsLightAdaptation =
    !needsStrongerAdaptation &&
    (
      checkIn.feeling === 'tired' ||
      hasPoorSleep ||
      hasSymptoms
    )

  if (needsStrongerAdaptation) {
    actions.add('hold_load')
    actions.add(
      'reduce_accessory_volume',
    )
    actions.add('increase_rest')

    reasons.push(
      'Сегодня самочувствие указывает на повышенную усталость или дискомфорт. Предлагаю не повышать нагрузку, сохранить основные упражнения и немного сократить дополнительный объём.',
    )
  } else if (needsLightAdaptation) {
    actions.add('hold_load')
    actions.add('increase_rest')

    reasons.push(
      'Сегодня есть признаки усталости или дискомфорта. Предлагаю не повышать нагрузку и дать немного больше отдыха между подходами.',
    )
  }

  const hasTimeLimit =
    checkIn.availableMinutes !==
      undefined &&
    plannedMinutes !== undefined &&
    checkIn.availableMinutes <
      plannedMinutes

  if (hasTimeLimit) {
    actions.add('shorten_session')

    const availableMinutes =
      checkIn.availableMinutes as number

    const timeRatio =
      availableMinutes /
      plannedMinutes

    if (timeRatio <= 0.75) {
      actions.add(
        'reduce_accessory_volume',
      )
    }

    reasons.push(
      `Сегодня у тебя около ${availableMinutes} минут вместо запланированных ${plannedMinutes}. Предлагаю сохранить основные упражнения и сократить менее важный объём.`,
    )
  }

  if (actions.size === 0) {
    return {
      actions: [
        'keep_as_planned',
      ],
      reason:
        'Сегодня нет причин менять запланированную тренировку.',
      requiresConfirmation: false,
    }
  }

  return {
    actions: Array.from(actions),
    reason: reasons.join(' '),
    requiresConfirmation: true,

    targetMinutes: hasTimeLimit
      ? checkIn.availableMinutes
      : undefined,
  }
}