type OnboardingDaysPerWeekProps = {
  onSelect: (daysPerWeek: 2 | 3 | 4) => void
}

export function OnboardingDaysPerWeek({
  onSelect,
}: OnboardingDaysPerWeekProps) {
  return (
    <main className="app">
      <section className="home">
        <p className="program-label">
          Шаг 2 из 4
        </p>

        <h1>Сколько раз в неделю?</h1>

        <p className="subtitle">
          Выбери комфортное количество тренировок.
        </p>

        <article className="workout-card">
          <button
            type="button"
            onClick={() => onSelect(2)}
          >
            2 раза в неделю
          </button>

          <button
            type="button"
            onClick={() => onSelect(3)}
          >
            3 раза в неделю
          </button>

          <button
            type="button"
            onClick={() => onSelect(4)}
          >
            4 раза в неделю
          </button>
        </article>
      </section>
    </main>
  )
}