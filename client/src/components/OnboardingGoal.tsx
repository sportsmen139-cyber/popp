import type { TrainingGoal } from '../types/goal'

type OnboardingGoalProps = {
  onSelect: (goal: TrainingGoal) => void
}

export function OnboardingGoal({
  onSelect,
}: OnboardingGoalProps) {
  return (
    <main className="app">
      <section className="home">
        <p className="program-label">
          Шаг 4 из 4
        </p>

        <h1>Какая у тебя главная цель?</h1>

        <p className="subtitle">
          Мы учтём её при подборе программы и упражнений.
        </p>

        <article className="workout-card">
          <button
            type="button"
            onClick={() =>
              onSelect({
                goalType: 'general_fitness',
                target: {
                  type: 'whole_body',
                },
                priority: 'normal',
              })
            }
          >
            Поддерживать форму
          </button>

          <button
            type="button"
            onClick={() =>
              onSelect({
                goalType: 'hypertrophy',
                target: {
                  type: 'muscle_group',
                  id: 'glutes',
                },
                priority: 'high',
              })
            }
          >
            Увеличить ягодицы
          </button>

          <button
            type="button"
            onClick={() =>
              onSelect({
                goalType: 'exercise_performance',
                target: {
                  type: 'exercise',
                  id: 'pull_up',
                },
                priority: 'high',
              })
            }
          >
            Лучше подтягиваться
          </button>
        </article>
      </section>
    </main>
  )
}