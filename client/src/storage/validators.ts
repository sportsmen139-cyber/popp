import type { OnboardingProfile } from '../types/onboarding'
import type { ResolvedWorkout } from '../types/program'
import type { UserProgress } from '../types/progress'
import type { WorkoutSessionContext, WorkoutSessionResult, WorkoutSetResult } from '../types/workoutSession'
import { isNonNegativeInteger, isNonNegativeNumber, isRecord } from './localStorage'

export function isProfile(value: unknown): value is OnboardingProfile {
  return isRecord(value) && ['gym', 'home', 'outdoor'].includes(String(value.environment)) &&
    [2, 3, 4].includes(value.daysPerWeek as number) &&
    ['beginner', 'intermediate', 'advanced'].includes(String(value.level)) &&
    isRecord(value.goal) && typeof value.goal.goalType === 'string' &&
    isRecord(value.goal.target) && typeof value.goal.target.type === 'string' &&
    typeof value.goal.priority === 'string'
}

export function isProgress(value: unknown): value is UserProgress {
  return isRecord(value) && isNonNegativeInteger(value.completedWorkoutsCount)
}

export function isSetResult(value: unknown): value is WorkoutSetResult {
  return isRecord(value) && isNonNegativeInteger(value.setNumber) && value.setNumber > 0 &&
    (value.reps === undefined || isNonNegativeInteger(value.reps)) &&
    (value.weightKg === undefined || isNonNegativeNumber(value.weightKg))
}

export function isSessionContext(value: unknown): value is WorkoutSessionContext {
  if (!isRecord(value) || !isRecord(value.checkIn) || !isRecord(value.adaptation)) return false
  const { checkIn, adaptation } = value
  return typeof checkIn.feeling === 'string' && typeof checkIn.hasTrainingIssue === 'boolean' &&
    Array.isArray(checkIn.symptoms) && checkIn.symptoms.every((item) => typeof item === 'string') &&
    typeof adaptation.offered === 'boolean' && typeof adaptation.accepted === 'boolean' &&
    Array.isArray(adaptation.actions) && adaptation.actions.every((item) => typeof item === 'string')
}

export function isSessionResult(value: unknown): value is WorkoutSessionResult {
  return isRecord(value) && typeof value.workoutTemplateId === 'string' &&
    typeof value.completedAt === 'string' && Array.isArray(value.exercises) &&
    value.exercises.every((exercise) => isRecord(exercise) && typeof exercise.exerciseId === 'string' &&
      Array.isArray(exercise.sets) && exercise.sets.every(isSetResult) &&
      (exercise.difficulty === undefined || ['very_easy', 'normal', 'hard', 'very_hard', 'failed'].includes(String(exercise.difficulty)))) &&
    (value.sessionContext === undefined || isSessionContext(value.sessionContext))
}

export function isHistory(value: unknown): value is WorkoutSessionResult[] {
  return Array.isArray(value) && value.every(isSessionResult)
}

export function isResolvedWorkout(value: unknown): value is ResolvedWorkout {
  return isRecord(value) && typeof value.templateId === 'string' && typeof value.title === 'string' &&
    isNonNegativeNumber(value.estimatedMinutes) && Array.isArray(value.exercises) && value.exercises.length > 0 &&
    value.exercises.every((exercise) => isRecord(exercise) && typeof exercise.slotId === 'string' &&
      typeof exercise.exerciseId === 'string' && isNonNegativeInteger(exercise.sets) && exercise.sets > 0 &&
      isRecord(exercise.target) && typeof exercise.target.type === 'string' && typeof exercise.target.mode === 'string' &&
      isRecord(exercise.restSeconds) && isNonNegativeNumber(exercise.restSeconds.max))
}
