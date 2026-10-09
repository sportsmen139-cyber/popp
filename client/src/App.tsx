import { useState } from 'react'
import './App.css'
import { OnboardingGoal } from './components/OnboardingGoal'
import type { TrainingGoal } from './types/goal'
import { exercises } from './data/exercises'
import { resolveCurrentWorkout } from './domain/program/resolveCurrentWorkout'
import {
  loadOnboardingProfile,
  saveOnboardingProfile,
} from './storage/onboardingStorage'
import type { ExerciseTarget } from './types/training'

import { mockUserProgress } from './data/mockUserProgress'
import { OnboardingEnvironment } from './components/OnboardingEnvironment'
import { OnboardingDaysPerWeek } from './components/OnboardingDaysPerWeek'
import type {
  TrainingEnvironment,
  UserLevel,
} from './types/program'
import { OnboardingLevel } from './components/OnboardingLevel'
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
  const [workoutStarted, setWorkoutStarted] = useState(false)
  const [savedOnboardingProfile] =
  useState(loadOnboardingProfile)

  const [selectedEnvironment, setSelectedEnvironment] =
  useState<TrainingEnvironment | null>(
    savedOnboardingProfile?.environment ?? null,
  )

  const [selectedDaysPerWeek, setSelectedDaysPerWeek] =
  useState<2 | 3 | 4 | null>(
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
      onBack={() => setSelectedEnvironment(null)}
    />
  )
}
if (!selectedLevel) {
  return (
    <OnboardingLevel
      onSelect={setSelectedLevel}
      onBack={() => setSelectedDaysPerWeek(null)}
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

  const currentWorkoutResult = resolveCurrentWorkout({
    ...mockUserProgress,
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
            Не удалось подобрать тренировку для текущих настроек.
          </p>
        </section>
      </main>
    )
  }

  const currentWorkout = currentWorkoutResult.workout
  const currentProgram =
    currentWorkoutResult.trainingPlan.baseProgram

  if (workoutStarted) {
    return (
      <main className="app">
        <section className="home">
          <button
            className="back-button"
            type="button"
            onClick={() => setWorkoutStarted(false)}
          >
            ← Назад
          </button>

          <p className="program-label">
            {currentProgram.title}
          </p>

          <h1>{currentWorkout.title}</h1>

          <p className="subtitle">
  {currentWorkout.exercises.length} упражнений · около{' '}
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
                        {workoutExercise.sets} подхода ·{' '}
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
                    </div>
                  </article>
                )
              },
            )}
          </div>
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

        <h1>Твоя тренировка</h1>

        <p className="subtitle">
          Сегодня по плану — {currentWorkout.title}
        </p>

        <article className="workout-card">
          <div>
            <p className="workout-status">
              Сегодня
            </p>

            <h2>{currentWorkout.title}</h2>

            <p>
  {currentWorkout.exercises.length} упражнений · около{' '}
  {currentWorkout.estimatedMinutes} минут
</p>
          </div>

          <button
            type="button"
            onClick={() => setWorkoutStarted(true)}
          >
            Начать тренировку
          </button>
        </article>
      </section>
    </main>
  )
}

export default App