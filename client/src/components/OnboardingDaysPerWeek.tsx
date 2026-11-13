import { OnboardingShell } from './ui/Primitives'

export function OnboardingDaysPerWeek({
  onSelect,
  onBack,
}: {
  onSelect: (daysPerWeek: 2 | 3 | 4) => void
  onBack: () => void
}) {
  return (
    <OnboardingShell
      step={2}
      title="Сколько раз в неделю?"
      description="Выбери число тренировок в своём недельном плане."
      onBack={onBack}
    >
      <div className="frequency-options">
        {([2, 3, 4] as const).map((days) => (
          <button
            className="frequency-option"
            key={days}
            type="button"
            aria-label={`${days} раза в неделю`}
            onClick={() => onSelect(days)}
          >
            <strong>{days}</strong>
            <span>
              раза
              <br />в неделю
            </span>
          </button>
        ))}
      </div>
    </OnboardingShell>
  )
}
