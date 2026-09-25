import { useState } from 'react'
import './App.css'
import { workoutA } from './data/workoutA'

function App() {
  const [workoutStarted, setWorkoutStarted] = useState(false)

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

          <p className="program-label">{workoutA.programName}</p>

          <h1>{workoutA.title}</h1>

          <p className="subtitle">
            {workoutA.exercises.length} упражнений · около{' '}
            {workoutA.estimatedMinutes} минут
          </p>

          <div className="exercise-list">
            {workoutA.exercises.map((exercise, index) => (
              <article className="exercise-card" key={exercise.id}>
                <div className="exercise-number">{index + 1}</div>

                <div>
                  <h2>{exercise.name}</h2>

                  <p>
                    {exercise.sets} подхода · {exercise.repsMin}–
                    {exercise.repsMax}
                  </p>

                  <p className="exercise-rest">
                    Отдых: {exercise.restSeconds} сек.
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <section className="home">
        <p className="program-label">{workoutA.programName}</p>

        <h1>Твоя тренировка</h1>

        <p className="subtitle">
          Сегодня по плану — {workoutA.title}
        </p>

        <article className="workout-card">
          <div>
            <p className="workout-status">Сегодня</p>

            <h2>{workoutA.title}</h2>

            <p>
              {workoutA.exercises.length} упражнений · около{' '}
              {workoutA.estimatedMinutes} минут
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