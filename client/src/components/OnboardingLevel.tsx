import type { UserLevel } from '../types/program'
import { OnboardingChoice, OnboardingShell } from './ui/Primitives'

export function OnboardingLevel({
  onSelect,
  onBack,
}: {
  onSelect: (level: UserLevel) => void
  onBack: () => void
}) {
  return (
    <OnboardingShell
      step={3}
      title="Какой у тебя уровень?"
      description="Ориентируйся на свой опыт, а не на рабочий вес."
      onBack={onBack}
    >
      <div className="choice-list">
        <OnboardingChoice
          number="01"
          label="Новичок"
          hint="Начинаю или возвращаюсь после перерыва"
          onClick={() => onSelect('beginner')}
        />
        <OnboardingChoice
          number="02"
          label="Средний"
          hint="Знакомы основные упражнения"
          onClick={() => onSelect('intermediate')}
        />
        <OnboardingChoice
          number="03"
          label="Продвинутый"
          hint="Есть устойчивый тренировочный опыт"
          onClick={() => onSelect('advanced')}
        />
      </div>
    </OnboardingShell>
  )
}
