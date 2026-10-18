import { useState } from 'react'

import './App.css'

import { OnboardingDaysPerWeek } from './components/OnboardingDaysPerWeek'
import { OnboardingEnvironment } from './components/OnboardingEnvironment'
import { OnboardingGoal } from './components/OnboardingGoal'
import { OnboardingLevel } from './components/OnboardingLevel'

import { exercises } from './data/exercises'

import { resolveCurrentWorkout } from './domain/program/resolveCurrentWorkout'
import { resolveExerciseProgression } from './domain/program/progression/resolveExerciseProgression'
import { applySessionAdaptation } from './domain/session/applySessionAdaptation'
import { resolveSessionAdaptation } from './domain/session/resolveSessionAdaptation'

import {
  clearOnboardingProfile,
  loadOnboardingProfile,
  saveOnboardingProfile,
} from './storage/onboardingStorage'

import {
  loadUserProgress,
  saveUserProgress,
} from './storage/progressStorage'

import {
  loadWorkoutHistory,
  saveWorkoutSession,
} from './storage/workoutHistoryStorage'

import type { TrainingGoal } from './types/goal'

import type {
  ResolvedWorkout,
  TrainingEnvironment,
  UserLevel,
} from './types/program'

import type {
  SessionFeeling,
  SessionSymptom,
  SleepQuality,
} from './types/session'
import type { SessionAdaptation } from './types/sessionAdaptation'
import type { ExerciseTarget } from './types/training'

import type {
  WorkoutSessionContext,
  WorkoutSetResult,
} from './types/workoutSession'

function formatExerciseTarget(
  target: ExerciseTarget,
) {
  const unit =
    target.type === 'reps'
      ? 'повторений'
      : target.type === 'time'
        ? 'сек.'
        : 'м'

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

function formatRestSeconds(
  restSeconds: {
    min?: number
    max: number
  },
) {
  if (
    restSeconds.min !== undefined &&
    restSeconds.min !== restSeconds.max
  ) {
    return `${restSeconds.min}–${restSeconds.max}`
  }

  return `${restSeconds.max}`
}

type ExerciseHistoryDisplay = {
  primary: string
  secondary?: string
}

function formatExerciseHistory(
  sets: WorkoutSetResult[] | undefined,
): ExerciseHistoryDisplay {
  if (!sets || sets.length === 0) {
    return {
      primary: 'Пока нет записей',
    }
  }

  const meaningfulSets = [...sets]
    .sort(
      (a, b) =>
        a.setNumber - b.setNumber,
    )
    .filter(
      (set) =>
        set.weightKg !== undefined ||
        set.reps !== undefined,
    )

  if (meaningfulSets.length === 0) {
    return {
      primary: 'Пока нет записей',
    }
  }

  const hasAnyWeight =
    meaningfulSets.some(
      (set) =>
        set.weightKg !== undefined,
    )

  const hasAnyReps =
    meaningfulSets.some(
      (set) =>
        set.reps !== undefined,
    )

  if (hasAnyWeight && !hasAnyReps) {
    const weights = meaningfulSets
      .filter(
        (set) =>
          set.weightKg !== undefined,
      )
      .map((set) => set.weightKg)
      .join(' / ')

    return {
      primary: `Вес: ${weights} кг`,
      secondary:
        'Повторения не записаны',
    }
  }

  const records = meaningfulSets.map(
    (set) => {
      const hasWeight =
        set.weightKg !== undefined

      const hasReps =
        set.reps !== undefined

      if (hasWeight && hasReps) {
        return `${set.weightKg} кг × ${set.reps}`
      }

      if (hasWeight) {
        return `${set.weightKg} кг · повторения не указаны`
      }

      return `${set.reps} повт. · вес не указан`
    },
  )

  return {
    primary: records.join(' · '),
  }
}

function App() {
  const [
    workoutStarted,
    setWorkoutStarted,
  ] = useState(false)

  const [
    showSessionCheckIn,
    setShowSessionCheckIn,
  ] = useState(false)

  const [
    sessionFeeling,
    setSessionFeeling,
  ] = useState<SessionFeeling | null>(
    null,
  )

  const [
    sessionSleepQuality,
    setSessionSleepQuality,
  ] = useState<SleepQuality | null>(
    null,
  )

  const [
    sessionHasTrainingIssue,
    setSessionHasTrainingIssue,
  ] = useState<boolean | null>(
    null,
  )

  const [
    sessionSymptoms,
    setSessionSymptoms,
  ] = useState<SessionSymptom[]>([])

  const [
    showSessionTimeOptions,
    setShowSessionTimeOptions,
  ] = useState(false)

  const [
    sessionAvailableMinutes,
    setSessionAvailableMinutes,
  ] = useState<number | null>(
    null,
  )

  const [
    sessionAdaptation,
    setSessionAdaptation,
  ] = useState<SessionAdaptation | null>(
    null,
  )

  const [
    sessionWorkout,
    setSessionWorkout,
  ] = useState<ResolvedWorkout | null>(
    null,
  )

  const [
    workoutSessionContext,
    setWorkoutSessionContext,
  ] = useState<WorkoutSessionContext | null>(
    null,
  )

  const [
    workoutSetResults,
    setWorkoutSetResults,
  ] = useState<
    Record<string, WorkoutSetResult[]>
  >({})

  const [
    userProgress,
    setUserProgress,
  ] = useState(loadUserProgress)

  const [
    workoutHistory,
    setWorkoutHistory,
  ] = useState(loadWorkoutHistory)

  const [savedOnboardingProfile] =
    useState(loadOnboardingProfile)

  const [
    selectedEnvironment,
    setSelectedEnvironment,
  ] = useState<TrainingEnvironment | null>(
    savedOnboardingProfile?.environment ??
      null,
  )

  const [
    selectedDaysPerWeek,
    setSelectedDaysPerWeek,
  ] = useState<2 | 3 | 4 | null>(
    savedOnboardingProfile?.daysPerWeek ??
      null,
  )

  const [
    selectedLevel,
    setSelectedLevel,
  ] = useState<UserLevel | null>(
    savedOnboardingProfile?.level ??
      null,
  )

  const [
    selectedGoal,
    setSelectedGoal,
  ] = useState<TrainingGoal | null>(
    savedOnboardingProfile?.goal ??
      null,
  )

  function handleEditProfile() {
    clearOnboardingProfile()

    setWorkoutStarted(false)
    setShowSessionCheckIn(false)
    setSessionFeeling(null)
    setSessionSleepQuality(null)
    setSessionHasTrainingIssue(null)
    setSessionSymptoms([])
    setShowSessionTimeOptions(false)
    setSessionAvailableMinutes(null)
    setSessionAdaptation(null)
    setSessionWorkout(null)
    setWorkoutSessionContext(null)
    setSelectedEnvironment(null)
    setSelectedDaysPerWeek(null)
    setSelectedLevel(null)
    setSelectedGoal(null)
  }

  function handleCompleteWorkout(
    workoutTemplateId: string,
  ) {
    const completedSession = {
      workoutTemplateId,
      completedAt:
        new Date().toISOString(),

      exercises: Object.entries(
        workoutSetResults,
      ).map(
        ([exerciseId, sets]) => ({
          exerciseId,
          sets,
        }),
      ),

      sessionContext:
        workoutSessionContext ??
        undefined,
    }

    saveWorkoutSession(
      completedSession,
    )

    setWorkoutHistory(
      (currentHistory) => [
        ...currentHistory,
        completedSession,
      ],
    )

    const nextProgress = {
      completedWorkoutsCount:
        userProgress.completedWorkoutsCount +
        1,
    }

    saveUserProgress(nextProgress)
    setUserProgress(nextProgress)

    setWorkoutSetResults({})
    setWorkoutStarted(false)
    setShowSessionCheckIn(false)
    setSessionFeeling(null)
    setSessionSleepQuality(null)
    setSessionHasTrainingIssue(null)
    setSessionSymptoms([])
    setShowSessionTimeOptions(false)
    setSessionAvailableMinutes(null)
    setSessionAdaptation(null)
    setSessionWorkout(null)
    setWorkoutSessionContext(null)
  }

  function updateWorkoutSetResult(
    exerciseId: string,
    setNumber: number,
    patch: Partial<WorkoutSetResult>,
  ) {
    setWorkoutSetResults(
      (currentResults) => {
        const exerciseSets =
          currentResults[exerciseId] ??
          []

        const existingSet =
          exerciseSets.find(
            (set) =>
              set.setNumber ===
              setNumber,
          )

        const nextSet: WorkoutSetResult =
          {
            setNumber,
            ...existingSet,
            ...patch,
          }

        return {
          ...currentResults,

          [exerciseId]: [
            ...exerciseSets.filter(
              (set) =>
                set.setNumber !==
                setNumber,
            ),

            nextSet,
          ].sort(
            (a, b) =>
              a.setNumber -
              b.setNumber,
          ),
        }
      },
    )
  }

  if (!selectedEnvironment) {
    return (
      <OnboardingEnvironment
        onSelect={
          setSelectedEnvironment
        }
      />
    )
  }

  if (!selectedDaysPerWeek) {
    return (
      <OnboardingDaysPerWeek
        onSelect={
          setSelectedDaysPerWeek
        }
        onBack={() =>
          setSelectedEnvironment(null)
        }
      />
    )
  }

  if (!selectedLevel) {
    return (
      <OnboardingLevel
        onSelect={setSelectedLevel}
        onBack={() =>
          setSelectedDaysPerWeek(
            null,
          )
        }
      />
    )
  }

  if (!selectedGoal) {
    return (
      <OnboardingGoal
        onSelect={(goal) => {
          saveOnboardingProfile({
            environment:
              selectedEnvironment,

            daysPerWeek:
              selectedDaysPerWeek,

            level:
              selectedLevel,

            goal,
          })

          setSelectedGoal(goal)
        }}
        onBack={() =>
          setSelectedLevel(null)
        }
      />
    )
  }

  const currentWorkoutResult =
    resolveCurrentWorkout({
      ...userProgress,

      environment:
        selectedEnvironment,

      daysPerWeek:
        selectedDaysPerWeek,

      level:
        selectedLevel,

      goal:
        selectedGoal,
    })

  if (!currentWorkoutResult.ok) {
    return (
      <main className="app">
        <section className="home">
          <h1>
            Тренировка недоступна
          </h1>

          <p className="subtitle">
            Не удалось подобрать
            тренировку для текущих
            настроек.
          </p>

          <button
            className="primary-button"
            type="button"
            onClick={
              handleEditProfile
            }
          >
            Изменить профиль
          </button>
        </section>
      </main>
    )
  }

  const currentWorkout =
    currentWorkoutResult.workout

  const activeWorkout =
    sessionWorkout ?? currentWorkout

  const currentProgram =
    currentWorkoutResult.trainingPlan
      .baseProgram

  const lastWorkoutSession =
    workoutHistory[
      workoutHistory.length - 1
    ] ?? null

  function handleStartWorkout(
    workout: ResolvedWorkout,
  ) {
    setShowSessionCheckIn(false)

    if (
      Object.keys(
        workoutSetResults,
      ).length > 0
    ) {
      setWorkoutStarted(true)
      return
    }

    setSessionWorkout(workout)

    const initialResults: Record<
      string,
      WorkoutSetResult[]
    > = {}

    for (
      const workoutExercise of
        workout.exercises
    ) {
      const previousExerciseResult =
        [...workoutHistory]
          .reverse()
          .map((session) =>
            session.exercises.find(
              (result) =>
                result.exerciseId ===
                workoutExercise.exerciseId,
            ),
          )
          .find(
            (result) =>
              result !== undefined,
          )

      initialResults[
        workoutExercise.exerciseId
      ] = Array.from(
        {
          length:
            workoutExercise.sets,
        },

        (_, setIndex) => {
          const setNumber =
            setIndex + 1

          const previousSet =
            previousExerciseResult?.sets.find(
              (set) =>
                set.setNumber ===
                setNumber,
            )

          return {
            setNumber,

            weightKg:
              previousSet?.weightKg,
          }
        },
      )
    }

    setWorkoutSetResults(
      initialResults,
    )

    setWorkoutStarted(true)
  }

  function toggleSessionSymptom(
    symptom: SessionSymptom,
  ) {
    setSessionSymptoms(
      (currentSymptoms) =>
        currentSymptoms.includes(symptom)
          ? currentSymptoms.filter(
              (item) => item !== symptom,
            )
          : [
              ...currentSymptoms,
              symptom,
            ],
    )
  }

  function handleSessionCheckInContinue() {
    if (sessionFeeling === null) {
      return
    }

    if (
      sessionHasTrainingIssue === null
    ) {
      return
    }

    const checkIn = {
      feeling: sessionFeeling,
      sleepQuality:
        sessionSleepQuality ??
        undefined,
      hasTrainingIssue:
        sessionHasTrainingIssue,
      symptoms:
        sessionHasTrainingIssue
          ? sessionSymptoms
          : [],
      availableMinutes:
        sessionAvailableMinutes ??
        undefined,
    }

    const adaptation =
      resolveSessionAdaptation(
        checkIn,
        currentWorkout.estimatedMinutes,
      )

    setWorkoutSessionContext({
      checkIn,
      adaptation: {
        offered:
          adaptation.requiresConfirmation,
        accepted: false,
        actions: adaptation.actions,
        reason: adaptation.reason,
        targetMinutes:
          adaptation.targetMinutes,
      },
    })

    if (!adaptation.requiresConfirmation) {
      setSessionAdaptation(null)
      handleStartWorkout(currentWorkout)
      return
    }

    setSessionAdaptation(adaptation)
  }

  function handleAcceptSessionAdaptation() {
    if (sessionAdaptation === null) {
      return
    }

    setWorkoutSessionContext(
      (currentContext) =>
        currentContext === null
          ? null
          : {
              ...currentContext,
              adaptation: {
                ...currentContext.adaptation,
                accepted: true,
              },
            },
    )

    const adaptedWorkout =
      applySessionAdaptation(
        currentWorkout,
        sessionAdaptation,
      )

    handleStartWorkout(adaptedWorkout)
  }

  function handleKeepPlannedWorkout() {
    setSessionAdaptation(null)
    handleStartWorkout(currentWorkout)
  }

  if (workoutStarted) {
    return (
      <main className="app">
        <section className="workout-screen">
          <button
            className="back-button"
            type="button"
            onClick={() =>
              setWorkoutStarted(false)
            }
          >
            ← Назад
          </button>

          <p className="program-label">
            {currentProgram.title}
          </p>

          <h1>
            {activeWorkout.title}
          </h1>

          <p className="subtitle">
            {
              activeWorkout
                .exercises.length
            }{' '}
            упражнений · около{' '}
            {
              activeWorkout
                .estimatedMinutes
            }{' '}
            минут
          </p>

          <div className="exercise-list">
            {activeWorkout.exercises.map(
              (
                workoutExercise,
                index,
              ) => {
                const exercise =
                  exercises.find(
                    (item) =>
                      item.id ===
                      workoutExercise.exerciseId,
                  )

                if (!exercise) {
                  return null
                }

                const previousExerciseResult =
                  [...workoutHistory]
                    .reverse()
                    .map(
                      (session) =>
                        session.exercises.find(
                          (
                            result,
                          ) =>
                            result.exerciseId ===
                            workoutExercise.exerciseId,
                        ),
                    )
                    .find(
                      (result) =>
                        result !==
                        undefined,
                    )

                const currentExerciseSets =
                  workoutSetResults[
                    workoutExercise
                      .exerciseId
                  ] ?? []

                const allSetsCompleted =
                  currentExerciseSets.filter(
                    (set) =>
                      set.reps !==
                      undefined,
                  ).length ===
                  workoutExercise.sets

                const hasWeight =
                  currentExerciseSets.some(
                    (set) =>
                      set.weightKg !==
                      undefined,
                  )

                const canUseWeightProgression =
                  workoutExercise.target
                    .type === 'reps' &&
                  hasWeight

                const progressionDecision =
                  allSetsCompleted &&
                  canUseWeightProgression
                    ? resolveExerciseProgression(
                        {
                          currentSets:
                            currentExerciseSets,

                          previousSets:
                            previousExerciseResult
                              ?.sets,
                        },
                      )
                    : null

                const previousHistory =
                  previousExerciseResult
                    ? formatExerciseHistory(
                        previousExerciseResult.sets,
                      )
                    : null

                return (
                  <article
                    className="exercise-card"
                    key={
                      workoutExercise.slotId
                    }
                  >
                    <div className="exercise-head">
                      <div className="exercise-title-row">
                        <span className="exercise-index-inline">
                          {index + 1}
                        </span>

                        <h2>
                          {
                            exercise.name
                          }
                        </h2>
                      </div>

                      <p className="exercise-meta">
                        <span>
                          {
                            workoutExercise.sets
                          }{' '}
                          подхода
                        </span>

                        <span>
                          {formatExerciseTarget(
                            workoutExercise.target,
                          )}
                        </span>

                        <span>
                          Отдых{' '}
                          {formatRestSeconds(
                            workoutExercise.restSeconds,
                          )}{' '}
                          сек.
                        </span>
                      </p>

                      {previousHistory && (
                        <div className="previous-result">
                          <strong>
                            В прошлый раз:
                          </strong>{' '}
                          {
                            previousHistory.primary
                          }

                          {previousHistory.secondary && (
                            <>
                              <br />

                              <span>
                                {
                                  previousHistory.secondary
                                }
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="sets-block">
                      <div className="sets-header">
                        <span>
                          Подход
                        </span>

                        <span>
                          Вес, кг
                        </span>

                        <span>
                          Повторения
                        </span>

                        <span />
                      </div>

                      {Array.from(
                        {
                          length:
                            workoutExercise.sets,
                        },

                        (
                          _,
                          setIndex,
                        ) => {
                          const setNumber =
                            setIndex + 1

                          const setResult =
                            currentExerciseSets.find(
                              (set) =>
                                set.setNumber ===
                                setNumber,
                            )

                          const isComplete =
                            setResult?.reps !==
                            undefined

                          return (
                            <div
                              className="set-row"
                              key={
                                setNumber
                              }
                            >
                              <span className="set-label">
                                Подход{' '}
                                {
                                  setNumber
                                }

                                {setNumber ===
                                workoutExercise.sets
                                  ? ' · тестовый'
                                  : ''}
                              </span>

                              <div className="set-field set-field-weight">
                                <span className="set-field-label">
                                  Вес, кг
                                </span>

                                <input
                                  className="set-input"
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.5"
                                  aria-label={`Вес, подход ${setNumber}`}
                                  placeholder="—"
                                  value={
                                    setResult?.weightKg ??
                                    ''
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    updateWorkoutSetResult(
                                      workoutExercise.exerciseId,
                                      setNumber,
                                      {
                                        weightKg:
                                          event
                                            .target
                                            .value ===
                                          ''
                                            ? undefined
                                            : Number(
                                                event
                                                  .target
                                                  .value,
                                              ),
                                      },
                                    )
                                  }
                                />
                              </div>

                              <div className="set-field set-field-reps">
                                <span className="set-field-label">
                                  Повторения
                                </span>

                                <input
                                  className="set-input"
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  step="1"
                                  aria-label={`Повторения, подход ${setNumber}`}
                                  placeholder="—"
                                  value={
                                    setResult?.reps ??
                                    ''
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    updateWorkoutSetResult(
                                      workoutExercise.exerciseId,
                                      setNumber,
                                      {
                                        reps:
                                          event
                                            .target
                                            .value ===
                                          ''
                                            ? undefined
                                            : Number(
                                                event
                                                  .target
                                                  .value,
                                              ),
                                      },
                                    )
                                  }
                                />
                              </div>

                              <span
                                className={`set-status ${
                                  isComplete
                                    ? 'is-complete'
                                    : ''
                                }`}
                                aria-label={
                                  isComplete
                                    ? 'Подход завершён'
                                    : 'Подход не завершён'
                                }
                              >
                                {isComplete
                                  ? '✓'
                                  : '○'}
                              </span>
                            </div>
                          )
                        },
                      )}
                    </div>

                    {progressionDecision && (
                      <p className="progression-message">
                        {
                          progressionDecision.message
                        }
                      </p>
                    )}
                  </article>
                )
              },
            )}
          </div>

          <button
            className="primary-button"
            type="button"
            onClick={() =>
              handleCompleteWorkout(
                activeWorkout.templateId,
              )
            }
          >
            Завершить тренировку
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <section className="home">
        <div className="top-bar">
          <p className="program-label">
            {currentProgram.title}
          </p>

          <button
            className="profile-button"
            type="button"
            onClick={
              handleEditProfile
            }
          >
            Изменить профиль
          </button>
        </div>

        <h1>
          Твоя тренировка
        </h1>

        <p className="subtitle">
          Сегодня всё готово —
          остаётся начать.
        </p>

        <div className="dashboard-grid">
          <section className="dashboard-main">
            <article className="workout-card">
              <p className="workout-status">
                Сегодня
              </p>

              <h2>
                {currentWorkout.title}
              </h2>

              <p className="workout-meta">
                {
                  currentWorkout
                    .exercises.length
                }{' '}
                упражнений · около{' '}
                {
                  currentWorkout
                    .estimatedMinutes
                }{' '}
                минут
              </p>

              {!showSessionCheckIn ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    setSessionFeeling(null)
                    setSessionSleepQuality(
                      null,
                    )
                    setSessionHasTrainingIssue(
                      null,
                    )
                    setSessionSymptoms([])
                    setShowSessionTimeOptions(
                      false,
                    )
                    setSessionAvailableMinutes(
                      null,
                    )
                    setSessionAdaptation(null)
                    setWorkoutSessionContext(
                      null,
                    )
                    setShowSessionCheckIn(
                      true,
                    )
                  }}
                >
                  Начать тренировку
                </button>
              ) : sessionAdaptation ? (
                <div className="session-checkin">
                  <h3>
                    Предлагаю адаптировать тренировку
                  </h3>

                  <p className="subtitle">
                    {sessionAdaptation.reason}
                  </p>

                  <button
                    className="primary-button"
                    type="button"
                    onClick={
                      handleAcceptSessionAdaptation
                    }
                  >
                    Принять адаптацию
                  </button>

                  <button
                    className="profile-button"
                    type="button"
                    onClick={
                      handleKeepPlannedWorkout
                    }
                  >
                    Оставить обычную тренировку
                  </button>
                </div>
              ) : (
                <div className="session-checkin">
                  <h3>
                    Как себя чувствуешь сегодня?
                  </h3>

                  <div className="session-feeling-options">
                    <button
                      type="button"
                      className={`session-feeling-button ${
                        sessionFeeling ===
                        'great'
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() =>
                        setSessionFeeling(
                          'great',
                        )
                      }
                    >
                      Отлично
                    </button>

                    <button
                      type="button"
                      className={`session-feeling-button ${
                        sessionFeeling ===
                        'normal'
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() =>
                        setSessionFeeling(
                          'normal',
                        )
                      }
                    >
                      Нормально
                    </button>

                    <button
                      type="button"
                      className={`session-feeling-button ${
                        sessionFeeling ===
                        'tired'
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() =>
                        setSessionFeeling(
                          'tired',
                        )
                      }
                    >
                      Усталость
                    </button>

                    <button
                      type="button"
                      className={`session-feeling-button ${
                        sessionFeeling ===
                        'poor'
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() =>
                        setSessionFeeling(
                          'poor',
                        )
                      }
                    >
                      Плохо
                    </button>
                  </div>

                  <h3>
                    Как спалось?
                  </h3>

                  <div className="session-feeling-options">
                    <button
                      type="button"
                      className={`session-feeling-button ${
                        sessionSleepQuality ===
                        'good'
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() =>
                        setSessionSleepQuality(
                          'good',
                        )
                      }
                    >
                      Хорошо
                    </button>

                    <button
                      type="button"
                      className={`session-feeling-button ${
                        sessionSleepQuality ===
                        'normal'
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() =>
                        setSessionSleepQuality(
                          'normal',
                        )
                      }
                    >
                      Нормально
                    </button>

                    <button
                      type="button"
                      className={`session-feeling-button ${
                        sessionSleepQuality ===
                        'poor'
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() =>
                        setSessionSleepQuality(
                          'poor',
                        )
                      }
                    >
                      Плохо
                    </button>

                    <button
                      type="button"
                      className="session-skip-button"
                      onClick={() =>
                        setSessionSleepQuality(
                          null,
                        )
                      }
                    >
                      Не указывать
                    </button>
                  </div>

                  <h3>
                    Что-то мешает тренировке?
                  </h3>

                  <div className="session-feeling-options">
                    <button
                      type="button"
                      className={`session-feeling-button ${
                        sessionHasTrainingIssue ===
                        false
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() => {
                        setSessionHasTrainingIssue(
                          false,
                        )
                        setSessionSymptoms([])
                      }}
                    >
                      Нет
                    </button>

                    <button
                      type="button"
                      className={`session-feeling-button ${
                        sessionHasTrainingIssue ===
                        true
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() =>
                        setSessionHasTrainingIssue(
                          true,
                        )
                      }
                    >
                      Да
                    </button>
                  </div>

                  {sessionHasTrainingIssue ===
                    true && (
                    <div className="session-symptom-details">
                      <p className="session-question-hint">
                        Что именно?
                      </p>

                      <div className="session-feeling-options">
                        <button
                          type="button"
                          className={`session-feeling-button ${
                            sessionSymptoms.includes(
                              'pain_or_discomfort',
                            )
                              ? 'is-selected'
                              : ''
                          }`}
                          onClick={() =>
                            toggleSessionSymptom(
                              'pain_or_discomfort',
                            )
                          }
                        >
                          Боль / дискомфорт
                        </button>

                        <button
                          type="button"
                          className={`session-feeling-button ${
                            sessionSymptoms.includes(
                              'cramps',
                            )
                              ? 'is-selected'
                              : ''
                          }`}
                          onClick={() =>
                            toggleSessionSymptom(
                              'cramps',
                            )
                          }
                        >
                          Спазмы
                        </button>

                        <button
                          type="button"
                          className={`session-feeling-button ${
                            sessionSymptoms.includes(
                              'low_energy',
                            )
                              ? 'is-selected'
                              : ''
                          }`}
                          onClick={() =>
                            toggleSessionSymptom(
                              'low_energy',
                            )
                          }
                        >
                          Низкая энергия
                        </button>

                        <button
                          type="button"
                          className={`session-feeling-button ${
                            sessionSymptoms.includes(
                              'headache',
                            )
                              ? 'is-selected'
                              : ''
                          }`}
                          onClick={() =>
                            toggleSessionSymptom(
                              'headache',
                            )
                          }
                        >
                          Головная боль
                        </button>

                        <button
                          type="button"
                          className={`session-feeling-button ${
                            sessionSymptoms.includes(
                              'bloating',
                            )
                              ? 'is-selected'
                              : ''
                          }`}
                          onClick={() =>
                            toggleSessionSymptom(
                              'bloating',
                            )
                          }
                        >
                          Вздутие
                        </button>

                        <button
                          type="button"
                          className={`session-feeling-button ${
                            sessionSymptoms.includes(
                              'other',
                            )
                              ? 'is-selected'
                              : ''
                          }`}
                          onClick={() =>
                            toggleSessionSymptom(
                              'other',
                            )
                          }
                        >
                          Другое
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="session-time-block">
                    <div className="session-time-summary">
                      <div>
                        <h3>
                          Время на тренировку
                        </h3>

                        <p className="session-question-hint">
                          Сегодня ≈{' '}
                          {
                            currentWorkout
                              .estimatedMinutes
                          }{' '}
                          минут
                        </p>
                      </div>

                      {currentWorkout.estimatedMinutes >
                        20 && (
                        <button
                          type="button"
                          className="session-skip-button"
                          onClick={() => {
                            if (
                              showSessionTimeOptions
                            ) {
                              setShowSessionTimeOptions(
                                false,
                              )
                              setSessionAvailableMinutes(
                                null,
                              )
                              return
                            }

                            setShowSessionTimeOptions(
                              true,
                            )
                          }}
                        >
                          {showSessionTimeOptions
                            ? 'Полное время'
                            : 'У меня меньше времени'}
                        </button>
                      )}
                    </div>

                    {showSessionTimeOptions && (
                      <div className="session-time-options">
                        {[20, 30, 45]
                          .filter(
                            (minutes) =>
                              minutes <
                              currentWorkout.estimatedMinutes,
                          )
                          .map(
                            (minutes) => (
                              <button
                                key={minutes}
                                type="button"
                                className={`session-feeling-button ${
                                  sessionAvailableMinutes ===
                                  minutes
                                    ? 'is-selected'
                                    : ''
                                }`}
                                onClick={() =>
                                  setSessionAvailableMinutes(
                                    minutes,
                                  )
                                }
                              >
                                {minutes} мин
                              </button>
                            ),
                          )}
                      </div>
                    )}
                  </div>

                  <button
                    className="profile-button"
                    type="button"
                    disabled={
                      sessionFeeling === null ||
                      sessionHasTrainingIssue ===
                        null ||
                      (
                        sessionHasTrainingIssue &&
                        sessionSymptoms.length ===
                          0
                      )
                    }
                    onClick={
                      handleSessionCheckInContinue
                    }
                  >
                    Продолжить
                  </button>
                </div>
              )}
            </article>
          </section>

          <aside className="dashboard-side">
            <article className="history-card">
              <h2>
                Последняя тренировка
              </h2>

              {!lastWorkoutSession ? (
                <p className="subtitle">
                  Пока нет завершённых
                  тренировок.
                </p>
              ) : (
                <div className="history-list">
                  {lastWorkoutSession.exercises.map(
                    (
                      exerciseResult,
                    ) => {
                      const exercise =
                        exercises.find(
                          (item) =>
                            item.id ===
                            exerciseResult.exerciseId,
                        )

                      if (!exercise) {
                        return null
                      }

                      const history =
                        formatExerciseHistory(
                          exerciseResult.sets,
                        )

                      return (
                        <div
                          className="history-item"
                          key={
                            exerciseResult.exerciseId
                          }
                        >
                          <strong>
                            {
                              exercise.name
                            }
                          </strong>

                          <p>
                            {
                              history.primary
                            }
                          </p>

                          {history.secondary && (
                            <p>
                              {
                                history.secondary
                              }
                            </p>
                          )}
                        </div>
                      )
                    },
                  )}
                </div>
              )}
            </article>
          </aside>
        </div>
      </section>
    </main>
  )
}

export default App