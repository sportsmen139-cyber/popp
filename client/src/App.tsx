import { lazy, Suspense, useState } from 'react'
import type { ReactNode } from 'react'

import './App.css'

import { OnboardingDaysPerWeek } from './components/OnboardingDaysPerWeek'
import { OnboardingEnvironment } from './components/OnboardingEnvironment'
import { OnboardingGoal } from './components/OnboardingGoal'
import { OnboardingLevel } from './components/OnboardingLevel'
import {
  ActionButton,
  AppHeader,
  EquipmentNote,
  Icon,
  OptionButton,
  SelectionGroup,
} from './components/ui/Primitives'
import { useScreenFocus, useVisualViewportInset } from './components/ui/useScreenFocus'
import { useTelegramLifecycle } from './components/ui/useTelegramLifecycle'
import { ProgressBoundary } from './components/ui/ProgressBoundary'
import { FeedbackScreen } from './features/feedback/FeedbackScreen'
import { ExerciseTechniqueVideo } from './features/exerciseVideo/ExerciseTechniqueVideo'

import { exercises } from './data/exercises'

import { buildCoachMemory } from './domain/coach/buildCoachMemory'
import { resolveCoachInsights } from './domain/coach/resolveCoachInsight'
import { resolveCurrentWorkout } from './domain/program/resolveCurrentWorkout'
import { resolveExerciseProgression } from './domain/program/progression/resolveExerciseProgression'
import { applySessionAdaptation } from './domain/session/applySessionAdaptation'
import { resolveSessionAdaptation } from './domain/session/resolveSessionAdaptation'

import {
  saveOnboardingProfile,
} from './storage/onboardingStorage'

import { commitCompletion, loadApplicationState, prepareCompletion, saveWorkoutDraft } from './storage/workoutPersistence'
import type { PendingCompletion, WorkoutDraft } from './storage/workoutPersistence'

import type { TrainingGoal } from './types/goal'
import { resolveGoal } from './domain/program/resolveGoal'

import type { ResolvedWorkout, TrainingEnvironment, UserLevel } from './types/program'

import type { SessionFeeling, SessionSymptom, SleepQuality } from './types/session'
import type { SessionAdaptation } from './types/sessionAdaptation'
import type { ExerciseTarget } from './types/training'

import type {
  WorkoutSessionContext,
  WorkoutSetResult,
} from './types/workoutSession'

const ProgressScreen = lazy(() =>
  import('./components/ProgressScreen').then((module) => ({ default: module.ProgressScreen })),
)

function formatExerciseTarget(target: ExerciseTarget) {
  const unit = target.type === 'reps' ? 'повторений' : target.type === 'time' ? 'сек.' : 'м'

  if (target.mode === 'range') {
    return `${target.min}–${target.max} ${unit}`
  }

  if (target.mode === 'fixed') {
    return `${target.value} ${unit}`
  }

  if (target.type === 'reps') {
    return 'максимум повторений'
  }

  if (target.type === 'time') {
    return 'максимум времени'
  }

  return 'максимальная дистанция'
}

function formatRestSeconds(restSeconds: { min?: number; max: number }) {
  if (restSeconds.min !== undefined && restSeconds.min !== restSeconds.max) {
    return `${restSeconds.min}–${restSeconds.max}`
  }

  return `${restSeconds.max}`
}

type ExerciseHistoryDisplay = {
  primary: string
  secondary?: string
}

function formatExerciseHistory(sets: WorkoutSetResult[] | undefined): ExerciseHistoryDisplay {
  if (!sets || sets.length === 0) {
    return {
      primary: 'Пока нет записей',
    }
  }

  const meaningfulSets = [...sets]
    .sort((a, b) => a.setNumber - b.setNumber)
    .filter((set) => set.weightKg !== undefined || set.reps !== undefined)

  if (meaningfulSets.length === 0) {
    return {
      primary: 'Пока нет записей',
    }
  }

  const hasAnyWeight = meaningfulSets.some((set) => set.weightKg !== undefined)

  const hasAnyReps = meaningfulSets.some((set) => set.reps !== undefined)

  if (hasAnyWeight && !hasAnyReps) {
    const weights = meaningfulSets
      .filter((set) => set.weightKg !== undefined)
      .map((set) => set.weightKg)
      .join(' / ')

    return {
      primary: `Вес: ${weights} кг`,
      secondary: 'Повторения не записаны',
    }
  }

  const records = meaningfulSets.map((set) => {
    const hasWeight = set.weightKg !== undefined

    const hasReps = set.reps !== undefined

    if (hasWeight && hasReps) {
      return `${set.weightKg} кг × ${set.reps}`
    }

    if (hasWeight) {
      return `${set.weightKg} кг · повторения не указаны`
    }

    return `${set.reps} повт. · вес не указан`
  })

  return {
    primary: records.join(' · '),
  }
}

function App() {
  const [initialState] = useState(loadApplicationState)
  const [workoutDraft, setWorkoutDraft] = useState<WorkoutDraft | null>(initialState.draft)
  const [pendingCompletion, setPendingCompletion] = useState<PendingCompletion | null>(null)
  const [storageNotice, setStorageNotice] = useState<string | null>(null)
  const [confirmIncomplete, setConfirmIncomplete] = useState(false)
  const [activeScreen, setActiveScreen] = useState<'training' | 'progress' | 'feedback'>('training')
  const [workoutStarted, setWorkoutStarted] = useState(false)

  const [showSessionCheckIn, setShowSessionCheckIn] = useState(false)

  const [sessionFeeling, setSessionFeeling] = useState<SessionFeeling | null>(null)

  const [sessionSleepQuality, setSessionSleepQuality] = useState<SleepQuality | null>(null)

  const [sessionHasTrainingIssue, setSessionHasTrainingIssue] = useState<boolean | null>(null)

  const [sessionSymptoms, setSessionSymptoms] = useState<SessionSymptom[]>([])

  const [showSessionTimeOptions, setShowSessionTimeOptions] = useState(false)

  const [sessionAvailableMinutes, setSessionAvailableMinutes] = useState<number | null>(null)

  const [sessionAdaptation, setSessionAdaptation] = useState<SessionAdaptation | null>(null)

  const sessionWorkout = workoutDraft?.workout ?? null

  const [workoutSessionContext, setWorkoutSessionContext] = useState<WorkoutSessionContext | null>(
    initialState.draft?.sessionContext ?? null,
  )

  const workoutSetResults = workoutDraft?.results ?? {}
  const workoutExerciseDifficulty = workoutDraft?.difficulty ?? {}

  const [userProgress, setUserProgress] = useState(initialState.progress)

  const [workoutHistory, setWorkoutHistory] = useState(initialState.history)

  const [savedOnboardingProfile, setSavedOnboardingProfile] = useState(initialState.profile)

  const [selectedEnvironment, setSelectedEnvironment] = useState<TrainingEnvironment | null>(
    savedOnboardingProfile?.environment ?? null,
  )

  const [selectedDaysPerWeek, setSelectedDaysPerWeek] = useState<2 | 3 | 4 | null>(
    savedOnboardingProfile?.daysPerWeek ?? null,
  )

  const [selectedLevel, setSelectedLevel] = useState<UserLevel | null>(
    savedOnboardingProfile?.level ?? null,
  )

  const [selectedGoal, setSelectedGoal] = useState<TrainingGoal | null>(
    savedOnboardingProfile?.goal ?? null,
  )

  useScreenFocus(
    [
      activeScreen,
      workoutStarted,
      showSessionCheckIn,
      sessionAdaptation !== null,
      selectedEnvironment !== null,
      selectedDaysPerWeek !== null,
      selectedLevel !== null,
      selectedGoal !== null,
    ].join(':'),
  )
  useVisualViewportInset()
  useTelegramLifecycle(workoutDraft !== null)

  function reportStorageError(error: unknown) {
    setStorageNotice(error instanceof Error ? error.message : 'Не удалось сохранить данные. Повтори действие.')
  }

  function updateDraft(next: WorkoutDraft) {
    if (pendingCompletion) return
    setWorkoutDraft(next)
    setConfirmIncomplete(false)
    try {
      saveWorkoutDraft(next)
      setStorageNotice(null)
    } catch (error) {
      reportStorageError(error)
    }
  }

  function renderScreen(screen: ReactNode) {
    return <>
      {storageNotice && <aside className="storage-notice" role="alert">
        <p>{storageNotice}</p>
        {workoutDraft && <button type="button" className="secondary-button" onClick={() => {
          if (pendingCompletion) handleCompleteWorkout(true)
          else {
            try { saveWorkoutDraft(workoutDraft); setStorageNotice(null) }
            catch (error) { reportStorageError(error) }
          }
        }}>Повторить сохранение</button>}
        <button type="button" className="secondary-button" onClick={() => setStorageNotice(null)}>Понятно</button>
      </aside>}
      {screen}
    </>
  }

  function handleEditProfile() {
    if (workoutDraft) {
      setStorageNotice('Сначала заверши незавершённую тренировку. Её результаты и настройки сохранены для продолжения.')
      return
    }
    setActiveScreen('training')
    // Keep the saved profile until a complete, supported replacement is saved.

    setWorkoutStarted(false)
    setShowSessionCheckIn(false)
    setSessionFeeling(null)
    setSessionSleepQuality(null)
    setSessionHasTrainingIssue(null)
    setSessionSymptoms([])
    setShowSessionTimeOptions(false)
    setSessionAvailableMinutes(null)
    setSessionAdaptation(null)
    setWorkoutSessionContext(null)
    setSelectedEnvironment(null)
    setSelectedDaysPerWeek(null)
    setSelectedLevel(null)
    setSelectedGoal(null)
  }

  function handleCompleteWorkout(allowIncomplete = false) {
    if (!workoutDraft) return
    const invalidInput = document.querySelector<HTMLInputElement>('.set-input:invalid')
    if (!pendingCompletion && invalidInput) {
      invalidInput.reportValidity()
      invalidInput.focus()
      setStorageNotice('Проверь числа: вес должен быть неотрицательным, повторения — целыми.')
      return
    }
    const hasMissingReps = workoutDraft.workout.exercises.some((exercise) =>
      (workoutSetResults[exercise.exerciseId] ?? []).filter((set) => set.reps !== undefined).length !== exercise.sets)
    if (!pendingCompletion && hasMissingReps && !allowIncomplete) {
      setConfirmIncomplete(true)
      return
    }
    const completedSession = {
      workoutTemplateId: workoutDraft.workout.templateId,
      completedAt: new Date().toISOString(),

      exercises: Object.entries(workoutSetResults).map(([exerciseId, sets]) => ({
        exerciseId,
        sets,
        difficulty: workoutExerciseDifficulty[exerciseId],
      })),

      sessionContext: workoutDraft.sessionContext,
    }

    try {
      const pending = pendingCompletion ?? prepareCompletion(workoutDraft, completedSession)
      setPendingCompletion(pending)
      const saved = commitCompletion(pending)
      setWorkoutHistory(saved.history)
      setUserProgress(saved.progress)
    } catch (error) {
      reportStorageError(error)
      return
    }
    setWorkoutDraft(null)
    setPendingCompletion(null)
    setStorageNotice(null)
    setConfirmIncomplete(false)
    setWorkoutStarted(false)
    setShowSessionCheckIn(false)
    setSessionFeeling(null)
    setSessionSleepQuality(null)
    setSessionHasTrainingIssue(null)
    setSessionSymptoms([])
    setShowSessionTimeOptions(false)
    setSessionAvailableMinutes(null)
    setSessionAdaptation(null)
    setWorkoutSessionContext(null)
  }

  function updateWorkoutSetResult(
    exerciseId: string,
    setNumber: number,
    patch: Partial<WorkoutSetResult>,
  ) {
    if (!workoutDraft || pendingCompletion) return
    const currentResults = workoutDraft.results
    const exerciseSets = currentResults[exerciseId] ?? []

    const existingSet = exerciseSets.find((set) => set.setNumber === setNumber)

    const nextSet: WorkoutSetResult = {
      setNumber,
      ...existingSet,
      ...patch,
    }

    updateDraft({ ...workoutDraft, results: {
      ...currentResults,
      [exerciseId]: [...exerciseSets.filter((set) => set.setNumber !== setNumber), nextSet].sort(
        (a, b) => a.setNumber - b.setNumber),
    } })
  }

  if (activeScreen === 'feedback') {
    return renderScreen(<FeedbackScreen onBack={() => setActiveScreen('training')} />)
  }

  if (!selectedEnvironment) {
    return renderScreen(<OnboardingEnvironment onSelect={setSelectedEnvironment} />)
  }

  if (!selectedDaysPerWeek) {
    return renderScreen(
      <OnboardingDaysPerWeek
        onSelect={setSelectedDaysPerWeek}
        onBack={() => setSelectedEnvironment(null)}
      />
    )
  }

  if (!selectedLevel) {
    return renderScreen(
      <OnboardingLevel onSelect={setSelectedLevel} onBack={() => setSelectedDaysPerWeek(null)} />
    )
  }

  if (!selectedGoal) {
    return renderScreen(
      <OnboardingGoal
        selection={{ environment: selectedEnvironment, daysPerWeek: selectedDaysPerWeek, level: selectedLevel,
          completedWorkoutsCount: userProgress.completedWorkoutsCount,
          availableEquipment: savedOnboardingProfile?.availableEquipment }}
        onSelect={(goal) => {
          const profile = {
            ...savedOnboardingProfile,
            environment: selectedEnvironment,

            daysPerWeek: selectedDaysPerWeek,

            level: selectedLevel,

            goal,
          }
          try {
            saveOnboardingProfile(profile)
            setSavedOnboardingProfile(profile)
            setSelectedGoal(goal)
            setStorageNotice(null)
          } catch (error) { reportStorageError(error) }
        }}
        onBack={() => setSelectedLevel(null)}
      />
    )
  }

  if (activeScreen === 'progress') {
    return renderScreen(
      <ProgressBoundary onBack={() => setActiveScreen('training')}>
        <Suspense
          fallback={
            <main className="app">
              <section className="home">
                <AppHeader />
                <p className="loading-state" role="status">
                  Загружаем прогресс…
                </p>
              </section>
            </main>
          }
        >
          <ProgressScreen
            history={workoutHistory}
            daysPerWeek={selectedDaysPerWeek}
            goal={selectedGoal}
            onBack={() => setActiveScreen('training')}
          />
        </Suspense>
      </ProgressBoundary>
    )
  }

  const currentWorkoutResult = resolveCurrentWorkout({
    ...userProgress,

    environment: selectedEnvironment,

    daysPerWeek: selectedDaysPerWeek,

    level: selectedLevel,

    goal: selectedGoal,
    availableEquipment: savedOnboardingProfile?.availableEquipment,
  })

  if (!currentWorkoutResult.ok) {
    return renderScreen(
      <main className="app">
        <section className="home">
          <AppHeader />
          <div className="unavailable-state">
            <p className="eyebrow">Проверь настройки плана</p>
            <h1>Тренировка недоступна</h1>

            <p className="subtitle">
              {currentWorkoutResult.reason === 'invalid_equipment_inventory'
                ? 'Сохранённый список оборудования не распознан. Обнови профиль перед подбором тренировки.'
                : resolveGoal(selectedGoal) === null
                ? 'Для сохранённой цели программа в Alpha пока не подключена. Выбери другую цель в профиле. История тренировок сохранена.'
                : 'В этой alpha доступна программа для зала — 3 раза в неделю. Выбери эти настройки, чтобы проверить тренировку.'}
            </p>

            <button className="primary-button" type="button" onClick={handleEditProfile}>
              Изменить профиль
            </button>
            <div className="alpha-feedback-entry">
              <ActionButton variant="secondary" onClick={() => setActiveScreen('feedback')}>
                Обратная связь
              </ActionButton>
            </div>
          </div>
        </section>
      </main>
    )
  }

  const currentWorkout = currentWorkoutResult.workout

  const equipmentNotice =
    currentWorkoutResult.equipmentResolution.policy === 'provisional_gym'
      ? 'Оборудование зала пока не указано. План предварительный: проверь доступность инвентаря выбранных упражнений.'
      : null

  const activeWorkout = sessionWorkout ?? currentWorkout

  const currentProgram = currentWorkoutResult.trainingPlan.baseProgram

  const lastWorkoutSession = workoutHistory[workoutHistory.length - 1] ?? null

  const coachMemory = buildCoachMemory(workoutHistory)

  const coachMemoryMinimumSessions = 5

  const coachInsights = resolveCoachInsights(coachMemory)

  function handleStartWorkout(workout: ResolvedWorkout, context = workoutSessionContext) {
    setShowSessionCheckIn(false)

    if (workoutDraft) {
      setWorkoutStarted(true)
      return
    }

    const initialResults: Record<string, WorkoutSetResult[]> = {}

    for (const workoutExercise of workout.exercises) {
      const previousExerciseResult = [...workoutHistory]
        .reverse()
        .map((session) =>
          session.exercises.find((result) => result.exerciseId === workoutExercise.exerciseId),
        )
        .find((result) => result !== undefined)

      initialResults[workoutExercise.exerciseId] = Array.from(
        {
          length: workoutExercise.sets,
        },

        (_, setIndex) => {
          const setNumber = setIndex + 1

          const previousSet = previousExerciseResult?.sets.find(
            (set) => set.setNumber === setNumber,
          )

          return {
            setNumber,

            weightKg: previousSet?.weightKg,
          }
        },
      )
    }

    if (!selectedEnvironment || !selectedDaysPerWeek || !selectedLevel || !selectedGoal) return
    const draft: WorkoutDraft = {
      formatVersion: 1, stage: 'active', id: crypto.randomUUID(), startedAt: new Date().toISOString(),
      profile: { ...savedOnboardingProfile, environment: selectedEnvironment, daysPerWeek: selectedDaysPerWeek,
        level: selectedLevel, goal: selectedGoal },
      progress: userProgress, workout, results: initialResults, difficulty: {},
      ...(context ? { sessionContext: context } : {}),
    }
    try {
      saveWorkoutDraft(draft)
      setWorkoutDraft(draft)
      setWorkoutStarted(true)
      setStorageNotice(null)
    } catch (error) { reportStorageError(error) }
  }

  function toggleSessionSymptom(symptom: SessionSymptom) {
    setSessionSymptoms((currentSymptoms) =>
      currentSymptoms.includes(symptom)
        ? currentSymptoms.filter((item) => item !== symptom)
        : [...currentSymptoms, symptom],
    )
  }

  function handleSessionCheckInContinue() {
    if (sessionFeeling === null) {
      return
    }

    if (sessionHasTrainingIssue === null) {
      return
    }
    if (sessionHasTrainingIssue && sessionSymptoms.includes('pain_or_discomfort')) {
      setStorageNotice('При боли не продолжай вызывающее её упражнение. В alpha мы не подбираем нагрузку для продолжения через боль. Обсуди ситуацию с тренером, а причину боли — с медицинским специалистом.')
      return
    }

    const checkIn = {
      feeling: sessionFeeling,
      sleepQuality: sessionSleepQuality ?? undefined,
      hasTrainingIssue: sessionHasTrainingIssue,
      symptoms: sessionHasTrainingIssue ? sessionSymptoms : [],
      availableMinutes: sessionAvailableMinutes ?? undefined,
    }

    const adaptation = resolveSessionAdaptation(checkIn, currentWorkout.estimatedMinutes)

    const context: WorkoutSessionContext = {
      checkIn,
      adaptation: {
        offered: adaptation.requiresConfirmation,
        accepted: false,
        actions: adaptation.actions,
        reason: adaptation.reason,
        targetMinutes: adaptation.targetMinutes,
      },
    }
    setWorkoutSessionContext(context)

    if (!adaptation.requiresConfirmation) {
      setSessionAdaptation(null)
      handleStartWorkout(currentWorkout, context)
      return
    }

    setSessionAdaptation(adaptation)
  }

  function handleAcceptSessionAdaptation() {
    if (sessionAdaptation === null) {
      return
    }

    const context = workoutSessionContext === null
        ? null
        : {
            ...workoutSessionContext,
            adaptation: {
              ...workoutSessionContext.adaptation,
              accepted: true,
            },
          }
    setWorkoutSessionContext(context)

    const adaptedWorkout = applySessionAdaptation(currentWorkout, sessionAdaptation)

    handleStartWorkout(adaptedWorkout, context)
  }

  function handleKeepPlannedWorkout() {
    setSessionAdaptation(null)
    handleStartWorkout(currentWorkout)
  }

  if (workoutStarted) {
    return renderScreen(
      <main className="app">
        <section className="workout-screen">
          <AppHeader>
            <ActionButton variant="text" onClick={() => setWorkoutStarted(false)}>
              <Icon name="back" />К плану
            </ActionButton>
          </AppHeader>
          <header className="workout-heading">
            <p className="program-label">{currentProgram.title}</p>
            <h1>{activeWorkout.title}</h1>
            <p className="subtitle">
              {activeWorkout.exercises.length} упражнений · около {activeWorkout.estimatedMinutes}{' '}
              минут
            </p>
          </header>
          <EquipmentNote message={equipmentNotice} />

          <div className="exercise-list">
            {activeWorkout.exercises.map((workoutExercise, index) => {
              const exercise = exercises.find((item) => item.id === workoutExercise.exerciseId)

              if (!exercise) {
                return null
              }

              const previousExerciseResult = [...workoutHistory]
                .reverse()
                .map((session) =>
                  session.exercises.find(
                    (result) => result.exerciseId === workoutExercise.exerciseId,
                  ),
                )
                .find((result) => result !== undefined)

              const currentExerciseSets = workoutSetResults[workoutExercise.exerciseId] ?? []

              const allSetsCompleted =
                currentExerciseSets.filter((set) => set.reps !== undefined).length ===
                workoutExercise.sets

              const hasWeight = currentExerciseSets.some((set) => set.weightKg !== undefined)

              const canUseWeightProgression = workoutExercise.target.type === 'reps' && hasWeight

              const progressionDecision =
                allSetsCompleted && canUseWeightProgression
                  ? resolveExerciseProgression({
                      currentSets: currentExerciseSets,

                      previousSets: previousExerciseResult?.sets,

                      difficulty: workoutExerciseDifficulty[workoutExercise.exerciseId],
                    })
                  : null

              const previousHistory = previousExerciseResult
                ? formatExerciseHistory(previousExerciseResult.sets)
                : null

              return (
                <article
                  className="exercise-card"
                  aria-labelledby={`exercise-${workoutExercise.slotId}`}
                  key={workoutExercise.slotId}
                >
                  <div className="exercise-head">
                    <div className="exercise-title-row">
                      <span className="exercise-index-inline">
                        {String(index + 1).padStart(2, '0')}
                      </span>

                      <h2 id={`exercise-${workoutExercise.slotId}`}>{exercise.name}</h2>
                    </div>

                    <p className="exercise-meta">
                      <span>{workoutExercise.sets} подхода</span>

                      <span>{formatExerciseTarget(workoutExercise.target)}</span>

                      <span>Отдых {formatRestSeconds(workoutExercise.restSeconds)} сек.</span>
                    </p>

                    {previousHistory && (
                      <div className="previous-result">
                        <strong>В прошлый раз:</strong> {previousHistory.primary}
                        {previousHistory.secondary && (
                          <>
                            <br />

                            <span>{previousHistory.secondary}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <ExerciseTechniqueVideo exerciseId={exercise.id} />

                  <div className="sets-block">
                    <div className="sets-header">
                      <span>№</span>

                      <span>Вес, кг</span>

                      <span>Повторения</span>

                      <span />
                    </div>

                    {Array.from(
                      {
                        length: workoutExercise.sets,
                      },

                      (_, setIndex) => {
                        const setNumber = setIndex + 1

                        const setResult = currentExerciseSets.find(
                          (set) => set.setNumber === setNumber,
                        )

                        const isComplete = setResult?.reps !== undefined

                        return (
                          <div className="set-row" key={setNumber}>
                            <span className="set-label">
                              <span className="sr-only">Подход </span>
                              {String(setNumber).padStart(2, '0')}
                            </span>

                            <div className="set-field set-field-weight">
                              <span className="set-field-label">Вес, кг</span>

                              <input
                                className="set-input"
                                type="number"
                                inputMode="decimal"
                                enterKeyHint="next"
                                min="0"
                                step="any"
                                disabled={pendingCompletion !== null}
                                aria-label={`Вес, подход ${setNumber}`}
                                placeholder="—"
                                value={setResult?.weightKg ?? ''}
                                onChange={(event) =>
                                  updateWorkoutSetResult(workoutExercise.exerciseId, setNumber, {
                                    weightKg:
                                      event.target.value === ''
                                        ? undefined
                                        : Number(event.target.value),
                                  })
                                }
                              />
                            </div>

                            <div className="set-field set-field-reps">
                              <span className="set-field-label">Повторения</span>

                              <input
                                className="set-input"
                                type="number"
                                inputMode="numeric"
                                enterKeyHint="next"
                                min="0"
                                step="1"
                                disabled={pendingCompletion !== null}
                                aria-label={`Повторения, подход ${setNumber}`}
                                placeholder="—"
                                value={setResult?.reps ?? ''}
                                onChange={(event) =>
                                  updateWorkoutSetResult(workoutExercise.exerciseId, setNumber, {
                                    reps:
                                      event.target.value === ''
                                        ? undefined
                                        : Number(event.target.value),
                                  })
                                }
                              />
                            </div>

                            <span
                              role="img"
                              className={`set-status ${isComplete ? 'is-complete' : ''}`}
                              aria-label={isComplete ? 'Подход завершён' : 'Подход не завершён'}
                            >
                              {isComplete ? <Icon name="check" /> : '—'}
                            </span>
                          </div>
                        )
                      },
                    )}
                  </div>

                  <div className="exercise-difficulty-block">
                    <p className="session-question-hint">Как далось?</p>

                    <div className="session-feeling-options">
                      {(
                        [
                          ['very_easy', 'Легко'],
                          ['normal', 'Нормально'],
                          ['hard', 'Тяжело'],
                          ['very_hard', 'Очень тяжело'],
                          ['failed', 'Не получилось'],
                        ] as const
                      ).map(([difficulty, label]) => (
                        <OptionButton
                          key={difficulty}
                          type="button"
                          selected={
                            workoutExerciseDifficulty[workoutExercise.exerciseId] === difficulty
                          }
                          disabled={pendingCompletion !== null}
                          onClick={() => workoutDraft && updateDraft({ ...workoutDraft,
                            difficulty: { ...workoutDraft.difficulty, [workoutExercise.exerciseId]: difficulty },
                          })}
                        >
                          {label}
                        </OptionButton>
                      ))}
                    </div>
                  </div>

                  {progressionDecision && (
                    <p className="progression-message">{progressionDecision.message}</p>
                  )}
                </article>
              )
            })}
          </div>

          <footer className="workout-finish">
            {confirmIncomplete ? <div className="incomplete-confirmation" role="group" aria-label="Подтвердить завершение"
              tabIndex={-1} ref={(element) => element?.focus()}>
              <p>Не все подходы записаны. Если тренировка закончена, можно сохранить введённое. Пустые поля останутся пустыми.</p>
              <ActionButton onClick={() => handleCompleteWorkout(true)}>Сохранить как есть</ActionButton>
              <ActionButton variant="secondary" onClick={() => setConfirmIncomplete(false)}>Вернуться к вводу</ActionButton>
            </div> : <button
              className="primary-button"
              type="button"
              onClick={() => handleCompleteWorkout()}
            >
              {pendingCompletion ? 'Повторить сохранение' : 'Завершить тренировку'}
            </button>}
            <p>{pendingCompletion ? 'Сохранение в историю ещё не завершено.' : 'Черновик сохраняется на этом устройстве. Заверши тренировку, чтобы добавить её в историю.'}</p>
          </footer>
        </section>
      </main>
    )
  }

  return renderScreen(
    <main className="app">
      <section className={`home ${showSessionCheckIn ? 'has-checkin' : ''}`}>
        <AppHeader>
          {showSessionCheckIn ? (
            <ActionButton variant="text" onClick={() => setShowSessionCheckIn(false)}>
              <Icon name="back" />К плану
            </ActionButton>
          ) : (
            <>
              <ActionButton
                variant="secondary"
                aria-label="Мой прогресс"
                onClick={() => setActiveScreen('progress')}
              >
                <Icon name="progress" />
                Прогресс
              </ActionButton>
              <ActionButton
                variant="text"
                aria-label="Изменить профиль"
                onClick={handleEditProfile}
              >
                <Icon name="profile" />
                Профиль
              </ActionButton>
            </>
          )}
        </AppHeader>
        <header className="page-intro">
          <div>
            <p className="eyebrow">Твой тренировочный журнал</p>
            <h1>{showSessionCheckIn ? 'Перед тренировкой' : 'Тренировки'}</h1>
          </div>
        </header>
        <div className="dashboard-grid">
          <section className="dashboard-main" aria-label="Текущая тренировка">
            <article className={`workout-card ${showSessionCheckIn ? 'is-checkin' : ''}`}>
              <div className="workout-card-header">
                <p className="workout-status">
                  {showSessionCheckIn ? 'Твой план' : workoutDraft ? 'Незавершённая тренировка' : 'Следующая тренировка'}
                </p>
                <h2>{activeWorkout.title}</h2>
                <p className="hero-program">{currentProgram.title}</p>
                <div className="hero-metrics">
                  <div className="hero-metric">
                    <strong>≈{activeWorkout.estimatedMinutes}</strong>
                    <span>минут</span>
                  </div>
                  <div className="hero-metric">
                    <strong>{String(activeWorkout.exercises.length).padStart(2, '0')}</strong>
                    <span>упражнений</span>
                  </div>
                </div>
              </div>
              {!showSessionCheckIn ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    if (workoutDraft) { setWorkoutStarted(true); return }
                    setSessionFeeling(null)
                    setSessionSleepQuality(null)
                    setSessionHasTrainingIssue(null)
                    setSessionSymptoms([])
                    setShowSessionTimeOptions(false)
                    setSessionAvailableMinutes(null)
                    setSessionAdaptation(null)
                    setWorkoutSessionContext(null)
                    setShowSessionCheckIn(true)
                  }}
                >
                  {workoutDraft ? 'Продолжить тренировку' : 'Начать тренировку'} <Icon name="arrow" />
                </button>
              ) : sessionAdaptation ? (
                <div className="session-checkin">
                  <h3>Предлагаю адаптировать тренировку</h3>

                  <p className="subtitle">{sessionAdaptation.reason}</p>

                  <ActionButton onClick={handleAcceptSessionAdaptation}>
                    Принять адаптацию
                  </ActionButton>

                  <ActionButton variant="secondary" onClick={handleKeepPlannedWorkout}>
                    Оставить обычную тренировку
                  </ActionButton>
                </div>
              ) : (
                <div className="session-checkin">
                  <SelectionGroup number="01" label="Как себя чувствуешь сегодня?">
                    <div className="session-feeling-options">
                      <OptionButton
                        type="button"
                        selected={sessionFeeling === 'great'}
                        onClick={() => setSessionFeeling('great')}
                      >
                        Отлично
                      </OptionButton>

                      <OptionButton
                        type="button"
                        selected={sessionFeeling === 'normal'}
                        onClick={() => setSessionFeeling('normal')}
                      >
                        Нормально
                      </OptionButton>

                      <OptionButton
                        type="button"
                        selected={sessionFeeling === 'tired'}
                        onClick={() => setSessionFeeling('tired')}
                      >
                        Усталость
                      </OptionButton>

                      <OptionButton
                        type="button"
                        selected={sessionFeeling === 'poor'}
                        onClick={() => setSessionFeeling('poor')}
                      >
                        Плохо
                      </OptionButton>
                    </div>
                  </SelectionGroup>

                  <SelectionGroup number="02" label="Как спалось?">
                    <div className="session-feeling-options">
                      <OptionButton
                        type="button"
                        selected={sessionSleepQuality === 'good'}
                        onClick={() => setSessionSleepQuality('good')}
                      >
                        Хорошо
                      </OptionButton>

                      <OptionButton
                        type="button"
                        selected={sessionSleepQuality === 'normal'}
                        onClick={() => setSessionSleepQuality('normal')}
                      >
                        Нормально
                      </OptionButton>

                      <OptionButton
                        type="button"
                        selected={sessionSleepQuality === 'poor'}
                        onClick={() => setSessionSleepQuality('poor')}
                      >
                        Плохо
                      </OptionButton>

                      <button
                        type="button"
                        className="session-skip-button"
                        onClick={() => setSessionSleepQuality(null)}
                      >
                        Не указывать
                      </button>
                    </div>
                  </SelectionGroup>

                  <SelectionGroup number="03" label="Что-то мешает тренировке?">
                    <div className="session-feeling-options">
                      <OptionButton
                        type="button"
                        selected={sessionHasTrainingIssue === false}
                        onClick={() => {
                          setSessionHasTrainingIssue(false)
                          setSessionSymptoms([])
                        }}
                      >
                        Нет
                      </OptionButton>

                      <OptionButton
                        type="button"
                        selected={sessionHasTrainingIssue === true}
                        onClick={() => setSessionHasTrainingIssue(true)}
                      >
                        Да
                      </OptionButton>
                    </div>
                  </SelectionGroup>

                  {sessionHasTrainingIssue === true && (
                    <div className="session-symptom-details">
                      <p className="session-question-hint">Что именно?</p>

                      <div className="session-feeling-options">
                        <OptionButton
                          type="button"
                          selected={sessionSymptoms.includes('pain_or_discomfort')}
                          onClick={() => toggleSessionSymptom('pain_or_discomfort')}
                        >
                          Боль / дискомфорт
                        </OptionButton>

                        <OptionButton
                          type="button"
                          selected={sessionSymptoms.includes('cramps')}
                          onClick={() => toggleSessionSymptom('cramps')}
                        >
                          Спазмы
                        </OptionButton>

                        <OptionButton
                          type="button"
                          selected={sessionSymptoms.includes('low_energy')}
                          onClick={() => toggleSessionSymptom('low_energy')}
                        >
                          Низкая энергия
                        </OptionButton>

                        <OptionButton
                          type="button"
                          selected={sessionSymptoms.includes('headache')}
                          onClick={() => toggleSessionSymptom('headache')}
                        >
                          Головная боль
                        </OptionButton>

                        <OptionButton
                          type="button"
                          selected={sessionSymptoms.includes('bloating')}
                          onClick={() => toggleSessionSymptom('bloating')}
                        >
                          Вздутие
                        </OptionButton>

                        <OptionButton
                          type="button"
                          selected={sessionSymptoms.includes('other')}
                          onClick={() => toggleSessionSymptom('other')}
                        >
                          Другое
                        </OptionButton>
                      </div>
                    </div>
                  )}

                  <div className="session-time-block">
                    <div className="session-time-summary">
                      <div>
                        <h3>Время на тренировку</h3>

                        <p className="session-question-hint">
                          Сегодня ≈ {currentWorkout.estimatedMinutes} минут
                        </p>
                      </div>

                      {currentWorkout.estimatedMinutes > 20 && (
                        <button
                          type="button"
                          className="session-skip-button"
                          onClick={() => {
                            if (showSessionTimeOptions) {
                              setShowSessionTimeOptions(false)
                              setSessionAvailableMinutes(null)
                              return
                            }

                            setShowSessionTimeOptions(true)
                          }}
                        >
                          {showSessionTimeOptions ? 'Полное время' : 'У меня меньше времени'}
                        </button>
                      )}
                    </div>

                    {showSessionTimeOptions && (
                      <div className="session-time-options">
                        {[20, 30, 45]
                          .filter((minutes) => minutes < currentWorkout.estimatedMinutes)
                          .map((minutes) => (
                            <OptionButton
                              key={minutes}
                              type="button"
                              selected={sessionAvailableMinutes === minutes}
                              onClick={() => setSessionAvailableMinutes(minutes)}
                            >
                              {minutes} мин
                            </OptionButton>
                          ))}
                      </div>
                    )}
                  </div>

                  <ActionButton
                    disabled={
                      sessionFeeling === null ||
                      sessionHasTrainingIssue === null ||
                      (sessionHasTrainingIssue && sessionSymptoms.length === 0)
                    }
                    onClick={handleSessionCheckInContinue}
                  >
                    Продолжить
                  </ActionButton>
                </div>
              )}
            </article>
            {!showSessionCheckIn && (
              <>
                <EquipmentNote message={equipmentNotice} />
                <section className="workout-preview" aria-labelledby="workout-plan-title">
                  <div className="section-heading">
                    <h2 id="workout-plan-title">В программе</h2>
                    <span>Порядок упражнений</span>
                  </div>
                  <ol className="plan-list">
                    {activeWorkout.exercises.map((item, index) => (
                      <li className="plan-row" key={item.slotId}>
                        <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                        <div>
                          <strong>
                            {exercises.find((exercise) => exercise.id === item.exerciseId)?.name ??
                              item.exerciseId}
                          </strong>
                          <p>
                            {item.sets} подхода · {formatExerciseTarget(item.target)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </>
            )}
          </section>
          <aside className="dashboard-side">
            <article className="history-card">
              <h2>Последняя тренировка</h2>

              {lastWorkoutSession &&
                Number.isFinite(Date.parse(lastWorkoutSession.completedAt)) && (
                  <time className="history-date" dateTime={lastWorkoutSession.completedAt}>
                    {new Date(lastWorkoutSession.completedAt).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                    })}
                  </time>
                )}
              {!lastWorkoutSession ? (
                <p className="subtitle">Пока нет завершённых тренировок.</p>
              ) : (
                <div className="history-list">
                  {lastWorkoutSession.exercises.map((exerciseResult) => {
                    const exercise = exercises.find((item) => item.id === exerciseResult.exerciseId)

                    if (!exercise) {
                      return null
                    }

                    const history = formatExerciseHistory(exerciseResult.sets)

                    return (
                      <div className="history-item" key={exerciseResult.exerciseId}>
                        <strong>{exercise.name}</strong>

                        <p>{history.primary}</p>

                        {history.secondary && <p>{history.secondary}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </article>

            <article className="history-card coach-note">
              <p className="eyebrow">Coach Memory</p>
              <h2>Наблюдения тренера</h2>

              {coachMemory.analyzedSessions < coachMemoryMinimumSessions ? (
                <>
                  <p className="subtitle">
                    Собираю данные: {coachMemory.analyzedSessions} из {coachMemoryMinimumSessions}{' '}
                    тренировок с check-in.
                  </p>
                  <progress
                    value={coachMemory.analyzedSessions}
                    max={coachMemoryMinimumSessions}
                    aria-label="Тренировок с check-in для наблюдений"
                  />
                </>
              ) : coachInsights.length > 0 ? (
                <>
                  {coachInsights.map((insight) => (
                    <div className="coach-insight" key={insight.id}>
                      <strong>{insight.title}</strong>

                      <p className="subtitle">{insight.message}</p>
                    </div>
                  ))}
                </>
              ) : (
                <p className="subtitle">
                  Пока устойчивых паттернов не обнаружено. Продолжаю наблюдать за тренировками.
                </p>
              )}
            </article>
          </aside>
        </div>
        {!showSessionCheckIn && (
          <>
            <div className="alpha-feedback-entry">
              <ActionButton variant="secondary" onClick={() => setActiveScreen('feedback')}>
                Обратная связь
              </ActionButton>
            </div>
            <p className="local-storage-note">Записи хранятся на этом устройстве.</p>
          </>
        )}
      </section>
    </main>
  )
}

export default App
