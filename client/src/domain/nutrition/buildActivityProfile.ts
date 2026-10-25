import type {
  NutritionProfile,
} from '../../types/nutrition'

import type {
  ActivityProfile,
  ActivityProfileLevel,
} from '../../types/nutritionActivity'

export type TrainingActivityInput = {
  strengthSessionsPerWeek: number
  estimatedStrengthMinutesPerWeek: number
}

type BuildActivityProfileInput = {
  nutritionProfile: NutritionProfile
  trainingActivity: TrainingActivityInput
}

function getStepsScore(
  averageStepsPerDay?: number,
): number {
  if (averageStepsPerDay === undefined) {
    return 0
  }

  if (averageStepsPerDay < 4000) {
    return 0
  }

  if (averageStepsPerDay < 7000) {
    return 1
  }

  if (averageStepsPerDay < 10000) {
    return 2
  }

  return 3
}

function getWorkScore(
  workActivity:
    NutritionProfile['workActivity'],
): number {
  switch (workActivity) {
    case 'mostly_seated':
      return 0

    case 'mixed':
      return 1

    case 'mostly_standing':
      return 2

    case 'physically_active':
      return 3
  }
}

function getStructuredActivityScore(
  minutesPerWeek: number,
): number {
  if (minutesPerWeek < 60) {
    return 0
  }

  if (minutesPerWeek < 150) {
    return 1
  }

  if (minutesPerWeek < 300) {
    return 2
  }

  return 3
}

function resolveActivityLevel(
  score: number,
): ActivityProfileLevel {
  if (score <= 2) {
    return 'low'
  }

  if (score <= 5) {
    return 'moderate'
  }

  if (score <= 7) {
    return 'high'
  }

  return 'very_high'
}

export function buildActivityProfile(
  input: BuildActivityProfileInput,
): ActivityProfile {
  const {
    nutritionProfile,
    trainingActivity,
  } = input

  const cardioMinutesPerWeek =
    nutritionProfile.cardioMinutesPerWeek ??
    0

  const otherActivityMinutesPerWeek =
    nutritionProfile
      .otherActivityMinutesPerWeek ??
    0

  const structuredActivityMinutes =
    trainingActivity
      .estimatedStrengthMinutesPerWeek +
    cardioMinutesPerWeek +
    otherActivityMinutesPerWeek

  const score =
    getStepsScore(
      nutritionProfile.averageStepsPerDay,
    ) +
    getWorkScore(
      nutritionProfile.workActivity,
    ) +
    getStructuredActivityScore(
      structuredActivityMinutes,
    )

  return {
    level: resolveActivityLevel(score),

    averageStepsPerDay:
      nutritionProfile.averageStepsPerDay,

    workActivity:
      nutritionProfile.workActivity,

    strengthSessionsPerWeek:
      trainingActivity
        .strengthSessionsPerWeek,

    estimatedStrengthMinutesPerWeek:
      trainingActivity
        .estimatedStrengthMinutesPerWeek,

    cardioMinutesPerWeek,

    otherActivityMinutesPerWeek,

    dataAvailability: {
      cardioMinutesPerWeek:
        nutritionProfile.cardioMinutesPerWeek === undefined ? 'missing' : 'reported',
      otherActivityMinutesPerWeek:
        nutritionProfile.otherActivityMinutesPerWeek === undefined ? 'missing' : 'reported',
    },
  }
}
