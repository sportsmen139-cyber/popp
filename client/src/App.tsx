import { useState } from 'react'
import './App.css'

import { OnboardingDaysPerWeek } from './components/OnboardingDaysPerWeek'
import { OnboardingEnvironment } from './components/OnboardingEnvironment'
import { OnboardingGoal } from './components/OnboardingGoal'
import { OnboardingLevel } from './components/OnboardingLevel'

import { exercises } from './data/exercises'

import { resolveCurrentWorkout } from './domain/program/resolveCurrentWorkout'

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
  TrainingEnvironment,
  UserLevel,
} from './types/program'
import type { ExerciseTarget } from './types/training'
import type { WorkoutSetResult } from './types/workoutSession'

function formatExerciseTarget(target: ExerciseTarget) {
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

function App() {
  const [workoutStarted, setWorkoutStarted] =
    useState(false)

  const [workoutSetResults, setWorkoutSetResults] =
    useState<Record<string, WorkoutSetResult[]>>({})

  const [userProgress, setUserProgress] =
    useState(loadUserProgress)

  const [workoutHistory, setWorkoutHistory] =
    useState(loadWorkoutHistory)

  const [savedOnboardingProfile] =
    useState(loadOnboardingProfile)

  const [
    selectedEnvironment,
    setSelectedEnvironment,
  ] = useState<TrainingEnvironment | null>(
    savedOnboardingProfile?.environment ?? null,
  )

  const [
    selectedDaysPerWeek,
    setSelectedDaysPerWeek,
  ] = useState<2 | 3 | 4 | null>(
    savedOnboardingProfile?.daysPerWeek ?? null,
  )

  const [selectedLevel, setSelectedLevel] =
    useState<UserLevel | null>(
      savedOnboardingProfile?.level ?? null,
    )

  const [selectedGoal, setSelectedGoal] =
    useState<TrainingGoal | null>(
      savedOnboardingProfile?.goal ?? null,
    )

  function handleEditProfile() {
    clearOnboardingProfile()

    setWorkoutStarted(false)
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
      completedAt: new Date().toISOString(),
      exercises: Object.entries(
        workoutSetResults,
      ).map(([exerciseId, sets]) => ({
        exerciseId,
        sets,
      })),
    }

    saveWorkoutSession(completedSession)

    setWorkoutHistory([
      ...workoutHistory,
      completedSession,
    ])

    const nextProgress = {
      completedWorkoutsCount:
        userProgress.completedWorkoutsCount + 1,
    }

    saveUserProgress(nextProgress)
    setUserProgress(nextProgress)

    setWorkoutSetResults({})
    setWorkoutStarted(false)
  }

  function updateWorkoutSetResult(
    exerciseId: string,
    setNumber: number,
    patch: Partial<WorkoutSetResult>,
  ) {
    setWorkoutSetResults((currentResults) => {
      const exerciseSets =
        currentResults[exerciseId] ?? []

      const existingSet = exerciseSets.find(
        (set) => set.setNumber === setNumber,
      )

      const nextSet: WorkoutSetResult = {
        setNumber,
        ...existingSet,
        ...patch,
      }

      return {
        ...currentResults,
        [exerciseId]: [
          ...exerciseSets.filter(
            (set) => set.setNumber !== setNumber,
          ),
          nextSet,
        ].sort(
          (a, b) => a.setNumber - b.setNumber,
        ),
      }
    })
  }

  if (!selectedEnvironment) {
    return (
      <OnboardingEnvironment
        onSelect={setSelectedEnvironment}
      />
    )
  }

  if (!selectedDaysPerWeek) {
    return (
      <OnboardingDaysPerWeek
        onSelect={setSelectedDaysPerWeek}
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
          setSelectedDaysPerWeek(null)
        }
      />
    )
  }

  if (!selectedGoal) {
    return (
      <OnboardingGoal
        onSelect={(goal) => {
          saveOnboardingProfile({
            environment: selectedEnvironment,
            daysPerWeek: selectedDaysPerWeek,
            level: selectedLevel,
            goal,
          })

          setSelectedGoal(goal)
        }}
        onBack={() => setSelectedLevel(null)}
      />
    )
  }

  const currentWorkoutResult =
    resolveCurrentWorkout({
      ...userProgress,
      environment: selectedEnvironment,
      daysPerWeek: selectedDaysPerWeek,
      level: selectedLevel,
      goal: selectedGoal,
    })

  if (!currentWorkoutResult.ok) {
    return (
      <main className="app">
        <section className="home">
          <h1>Тренировка недоступна</h1>

          <p className="subtitle">
            Не удалось подобрать тренировку для
            текущих настроек.
          </p>

          <button
            type="button"
            onClick={handleEditProfile}
          >
            Изменить профиль
          </button>
        </section>
      </main>
    )
  }

  const currentWorkout =
    currentWorkoutResult.workout

  const currentProgram =
    currentWorkoutResult.trainingPlan.baseProgram
    const lastWorkoutSession =
  workoutHistory[workoutHistory.length - 1] ?? null

  if (workoutStarted) {
    return (
      <main className="app">
        <section className="home">
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

          <h1>{currentWorkout.title}</h1>

          <p className="subtitle">
            {currentWorkout.exercises.length}{' '}
            упражнений · около{' '}
            {currentWorkout.estimatedMinutes} минут
          </p>

          <div className="exercise-list">
            {currentWorkout.exercises.map(
              (workoutExercise, index) => {
                const exercise = exercises.find(
                  (item) =>
                    item.id ===
                    workoutExercise.exerciseId,
                )

                if (!exercise) {
                  return null
                }

                return (
                  <article
                    className="exercise-card"
                    key={workoutExercise.slotId}
                  >
                    <div className="exercise-number">
                      {index + 1}
                    </div>

                    <div>
                      <h2>{exercise.name}</h2>

                      <p>
                        {workoutExercise.sets}{' '}
                        подхода ·{' '}
                        {formatExerciseTarget(
                          workoutExercise.target,
                        )}
                      </p>

                      <p className="exercise-rest">
                        Отдых:{' '}
                        {formatRestSeconds(
                          workoutExercise.restSeconds,
                        )}{' '}
                        сек.
                      </p>

                      <div>
                        {Array.from(
                          {
                            length:
                              workoutExercise.sets,
                          },
                          (_, setIndex) => {
                            const setNumber =
                              setIndex + 1

                            const setResult =
                              workoutSetResults[
                                workoutExercise
                                  .exerciseId
                              ]?.find(
                                (set) =>
                                  set.setNumber ===
                                  setNumber,
                              )

                            return (
                              <div
                                className="set-row"
                                key={setNumber}
                              >
                                <span className="set-label">
                                  Подход {setNumber}
                                </span>

                                <input
                                  className="set-input"
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  placeholder="кг"
                                  value={
                                    setResult?.weightKg ??
                                    ''
                                  }
                                  onChange={(event) =>
                                    updateWorkoutSetResult(
                                      workoutExercise.exerciseId,
                                      setNumber,
                                      {
                                        weightKg:
                                          event.target
                                            .value === ''
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

                                <input
                                  className="set-input"
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="повт."
                                  value={
                                    setResult?.reps ??
                                    ''
                                  }
                                  onChange={(event) =>
                                    updateWorkoutSetResult(
                                      workoutExercise.exerciseId,
                                      setNumber,
                                      {
                                        reps:
                                          event.target
                                            .value === ''
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
                            )
                          },
                        )}
                      </div>
                    </div>
                  </article>
                )
              },
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              handleCompleteWorkout(
                currentWorkout.templateId,
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
        <p className="program-label">
          {currentProgram.title}
        </p>

        <button
          className="back-button"
          type="button"
          onClick={handleEditProfile}
        >
          Изменить профиль
        </button>

        <h1>Твоя тренировка</h1>

        <p className="subtitle">
          Сегодня по плану —{' '}
          {currentWorkout.title}
        </p>
{lastWorkoutSession && (
  <div>
    <h2>Последняя тренировка</h2>

    {lastWorkoutSession.exercises.map(
      (exerciseResult) => {
        const exercise = exercises.find(
          (item) =>
            item.id === exerciseResult.exerciseId,
        )

        if (!exercise) {
          return null
        }

        return (
          <div key={exerciseResult.exerciseId}>
            <strong>{exercise.name}</strong>

            <p>
              {exerciseResult.sets
                .map((set) => {
                  const weight =
                    set.weightKg ?? '—'

                  const reps =
                    set.reps ?? '—'

                  return `${weight} кг × ${reps}`
                })
                .join(' · ')}
            </p>
          </div>
        )
      },
    )}
  </div>
)}
        <article className="workout-card">
          <div>
            <p className="workout-status">
              Сегодня
            </p>

            <h2>{currentWorkout.title}</h2>

            <p>
              {currentWorkout.exercises.length}{' '}
              упражнений · около{' '}
              {currentWorkout.estimatedMinutes}{' '}
              минут
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setWorkoutStarted(true)
            }
          >
            Начать тренировку
          </button>
        </article>
      </section>
    </main>
  )
}

export default App