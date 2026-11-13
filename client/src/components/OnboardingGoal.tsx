import type { TrainingGoal } from '../types/goal'
import { OnboardingChoice, OnboardingShell } from './ui/Primitives'

export function OnboardingGoal({
  onSelect,
  onBack,
}: {
  onSelect: (goal: TrainingGoal) => void
  onBack: () => void
}) {
  return (
    <OnboardingShell
      step={4}
      title="Какая у тебя главная цель?"
      description="Добавим нужный акцент в подбор упражнений."
      onBack={onBack}
    >
      <div className="choice-list">
        <OnboardingChoice
          number="01"
          label="Поддерживать форму"
          hint="Сбалансированный подход"
          onClick={() =>
            onSelect({
              goalType: 'general_fitness',
              target: { type: 'whole_body' },
              priority: 'normal',
            })
          }
        />
        <OnboardingChoice
          number="02"
          label="Увеличить ягодицы"
          hint="Акцент на ягодичные мышцы"
          onClick={() =>
            onSelect({
              goalType: 'hypertrophy',
              target: { type: 'muscle_group', id: 'glutes' },
              priority: 'high',
            })
          }
        />
        <OnboardingChoice
          number="03"
          label="Лучше подтягиваться"
          hint="Работа над подтягиваниями"
          onClick={() =>
            onSelect({
              goalType: 'exercise_performance',
              target: { type: 'exercise', id: 'pull_up' },
              priority: 'high',
            })
          }
        />
      </div>
    </OnboardingShell>
  )
}
