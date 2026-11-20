import type { OnboardingProfile } from '../types/onboarding'
import type { ResolvedWorkout } from '../types/program'
import type { UserProgress } from '../types/progress'
import type { ExerciseDifficulty, WorkoutSessionContext, WorkoutSessionResult, WorkoutSetResult } from '../types/workoutSession'
import { LocalStorageError, isRecord, readRaw, readStored, removeStored, writeRaw } from './localStorage'
import { loadOnboardingProfile } from './onboardingStorage'
import { USER_PROGRESS_KEY, loadUserProgress } from './progressStorage'
import { WORKOUT_HISTORY_KEY, loadWorkoutHistory } from './workoutHistoryStorage'
import { isHistory, isProfile, isProgress, isResolvedWorkout, isSessionContext, isSessionResult, isSetResult } from './validators'

export const WORKOUT_DRAFT_KEY = 'fitness-workout-draft-v1'

export type WorkoutDraft = {
  formatVersion: 1
  stage: 'active'
  id: string
  startedAt: string
  profile: OnboardingProfile
  progress: UserProgress
  workout: ResolvedWorkout
  results: Record<string, WorkoutSetResult[]>
  difficulty: Record<string, ExerciseDifficulty>
  sessionContext?: WorkoutSessionContext
}

export type PendingCompletion = {
  formatVersion: 1
  stage: 'completing'
  draft: WorkoutDraft
  session: WorkoutSessionResult
  historyBefore: string | null
  progressBefore: string | null
}

function isDraft(value: unknown): value is WorkoutDraft {
  if (!isRecord(value) || value.formatVersion !== 1 || value.stage !== 'active' ||
    typeof value.id !== 'string' || !value.id || typeof value.startedAt !== 'string' ||
    !isProfile(value.profile) || !isProgress(value.progress) || !isResolvedWorkout(value.workout) ||
    !isRecord(value.results) || !isRecord(value.difficulty) ||
    (value.sessionContext !== undefined && !isSessionContext(value.sessionContext))) return false
  const workout = value.workout
  return Object.entries(value.results).every(([id, sets]) => {
    const exercise = workout.exercises.find((item) => item.exerciseId === id)
    return exercise && Array.isArray(sets) && sets.length <= exercise.sets &&
      sets.every((set) => isSetResult(set) && set.setNumber <= exercise.sets) &&
      new Set(sets.map((set: WorkoutSetResult) => set.setNumber)).size === sets.length
  }) && Object.entries(value.difficulty).every(([id, difficulty]) =>
    workout.exercises.some((item) => item.exerciseId === id) &&
    ['very_easy', 'normal', 'hard', 'very_hard', 'failed'].includes(String(difficulty)))
}

function isPending(value: unknown): value is PendingCompletion {
  if (!isRecord(value) || value.formatVersion !== 1 || value.stage !== 'completing' ||
    !isDraft(value.draft) || !isSessionResult(value.session) ||
    value.session.workoutTemplateId !== value.draft.workout.templateId ||
    !(value.historyBefore === null || typeof value.historyBefore === 'string') ||
    !(value.progressBefore === null || typeof value.progressBefore === 'string')) return false
  try {
    return isHistory(JSON.parse(value.historyBefore ?? '[]')) &&
      isProgress(JSON.parse(value.progressBefore ?? '{"completedWorkoutsCount":0}'))
  } catch {
    return false
  }
}

function loadRecord(): WorkoutDraft | PendingCompletion | null {
  return readStored<WorkoutDraft | PendingCompletion | null>(WORKOUT_DRAFT_KEY,
    (value): value is WorkoutDraft | PendingCompletion | null => isDraft(value) || isPending(value), null)
}

function sameProfile(a: OnboardingProfile | null, b: OnboardingProfile): boolean {
  return a !== null && a.environment === b.environment && a.daysPerWeek === b.daysPerWeek &&
    a.level === b.level && JSON.stringify(a.goal) === JSON.stringify(b.goal) &&
    JSON.stringify(a.availableEquipment) === JSON.stringify(b.availableEquipment)
}

function conflict(): never {
  throw new LocalStorageError('Записи изменились в другом окне или профиль больше не соответствует тренировке. Текущие данные не перезаписаны. Закрой другие окна и обратись к владельцу alpha, если ошибка повторяется.')
}

export function saveWorkoutDraft(draft: WorkoutDraft): void {
  if (!isDraft(draft)) throw new LocalStorageError('Проверь введённые числа: вес должен быть неотрицательным, повторения — целыми. Черновик пока не обновлён.')
  const existing = loadRecord()
  if (existing && (existing.stage !== 'active' || existing.id !== draft.id)) conflict()
  writeRaw(WORKOUT_DRAFT_KEY, JSON.stringify(draft))
}

export function prepareCompletion(draft: WorkoutDraft, session: WorkoutSessionResult): PendingCompletion {
  if (!isDraft(draft) || !isSessionResult(session)) throw new LocalStorageError('Не удалось подготовить сохранение. Проверь введённые результаты.')
  if (!sameProfile(loadOnboardingProfile(), draft.profile) ||
    loadUserProgress().completedWorkoutsCount !== draft.progress.completedWorkoutsCount) conflict()
  loadWorkoutHistory()
  return {
    formatVersion: 1, stage: 'completing', draft, session,
    historyBefore: readRaw(WORKOUT_HISTORY_KEY), progressBefore: readRaw(USER_PROGRESS_KEY),
  }
}

/** Write-ahead record keeps the two legacy keys recoverable without changing their format. */
export function commitCompletion(pending: PendingCompletion) {
  if (!isPending(pending)) throw new LocalStorageError('Не удалось прочитать незавершённое сохранение. Записи не изменены.')
  if (!sameProfile(loadOnboardingProfile(), pending.draft.profile)) conflict()
  const previousHistory = JSON.parse(pending.historyBefore ?? '[]') as WorkoutSessionResult[]
  const previousProgress = JSON.parse(pending.progressBefore ?? '{"completedWorkoutsCount":0}') as UserProgress
  if (previousProgress.completedWorkoutsCount !== pending.draft.progress.completedWorkoutsCount) conflict()
  const history = [...previousHistory, pending.session]
  const progress = { ...previousProgress, completedWorkoutsCount: previousProgress.completedWorkoutsCount + 1 }
  const historyAfter = JSON.stringify(history)
  const progressAfter = JSON.stringify(progress)
  const historyNow = readRaw(WORKOUT_HISTORY_KEY)
  const progressNow = readRaw(USER_PROGRESS_KEY)
  if (![pending.historyBefore, historyAfter].includes(historyNow) ||
    ![pending.progressBefore, progressAfter].includes(progressNow)) conflict()
  const stored = loadRecord()
  if (stored === null) {
    if (historyNow === historyAfter && progressNow === progressAfter) return { history, progress }
    conflict()
  }
  if (stored.stage === 'active' ? stored.id !== pending.draft.id : JSON.stringify(stored) !== JSON.stringify(pending)) conflict()
  // Persist the recovery record before either legacy key changes.
  writeRaw(WORKOUT_DRAFT_KEY, JSON.stringify(pending))
  if (historyNow !== historyAfter) writeRaw(WORKOUT_HISTORY_KEY, historyAfter)
  if (progressNow !== progressAfter) writeRaw(USER_PROGRESS_KEY, progressAfter)
  removeStored(WORKOUT_DRAFT_KEY)
  return { history, progress }
}

export function loadApplicationState() {
  let record = loadRecord()
  if (record?.stage === 'completing') {
    commitCompletion(record)
    record = null
  }
  const profile = loadOnboardingProfile()
  const progress = loadUserProgress()
  const history = loadWorkoutHistory()
  if (record && (!sameProfile(profile, record.profile) ||
    progress.completedWorkoutsCount !== record.progress.completedWorkoutsCount)) conflict()
  return { profile, progress, history, draft: record }
}
