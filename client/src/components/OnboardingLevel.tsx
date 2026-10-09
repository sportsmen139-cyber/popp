import type { UserLevel } from '../types/program'

type OnboardingLevelProps = {
  onSelect: (level: UserLevel) => void
}

export function OnboardingLevel({
  onSelect,
}: OnboardingLevelProps) {
  return (
    <main className="app">
      <section className="home">
        <p className="program-label">
          Шаг 3 из 4
        </p>

        <h1>Какой у тебя уровень?</h1>

        <p className="subtitle">
          Это поможет подобрать подходящие упражнения.
        </p>

        <article className="workout-card">
          <button
            type="button"
            onClick={() => onSelect('beginner')}
          >
            Новичок
          </button>

          <button
            type="button"
            onClick={() => onSelect('intermediate')}
          >
            Средний
          </button>

          <button
            type="button"
            onClick={() => onSelect('advanced')}
          >
            Продвинутый
          </button>
        </article>
      </section>
    </main>
  )
}