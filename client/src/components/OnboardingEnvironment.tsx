import type { TrainingEnvironment } from '../types/program'

type OnboardingEnvironmentProps = {
  onSelect: (environment: TrainingEnvironment) => void
}

export function OnboardingEnvironment({
  onSelect,
}: OnboardingEnvironmentProps) {
  return (
    <main className="app">
      <section className="home">
        <p className="program-label">
          Шаг 1 из 4
        </p>

        <h1>Где ты тренируешься?</h1>

        <p className="subtitle">
          Мы подберём программу и упражнения под твои условия.
        </p>

        <article className="workout-card">
          <button
            type="button"
            onClick={() => onSelect('gym')}
          >
            🏋️ В зале
          </button>

          <button
            type="button"
            onClick={() => onSelect('home')}
          >
            🏠 Дома
          </button>

          <button
            type="button"
            onClick={() => onSelect('outdoor')}
          >
            🌳 На улице
          </button>
        </article>
      </section>
    </main>
  )
}