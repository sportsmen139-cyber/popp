import type { TrainingEnvironment } from '../types/program'
import { OnboardingChoice, OnboardingShell } from './ui/Primitives'

export function OnboardingEnvironment({
  onSelect,
}: {
  onSelect: (environment: TrainingEnvironment) => void
}) {
  return (
    <OnboardingShell
      step={1}
      title="Где ты тренируешься?"
      description="В alpha доступна программа для зала на 3 тренировки в неделю."
    >
      <div className="choice-list">
        <OnboardingChoice
          number="01"
          label="В зале"
          hint="Тренажёры и свободные веса"
          onClick={() => onSelect('gym')}
        />
        <OnboardingChoice
          number="02"
          label="Дома"
          hint="Твоё пространство и инвентарь"
          onClick={() => onSelect('home')}
        />
        <OnboardingChoice
          number="03"
          label="На улице"
          hint="На свежем воздухе"
          onClick={() => onSelect('outdoor')}
        />
      </div>
    </OnboardingShell>
  )
}
