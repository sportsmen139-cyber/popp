import type { TrainingEnvironment } from '../types/program'

type OnboardingEnvironmentProps = {
  onSelect: (
    environment: TrainingEnvironment,
  ) => void
}

function GymIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 9v6M18 9v6M3.5 10.5v3M20.5 10.5v3M6 12h12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 10.5 12 4l8 6.5V20H4v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M9.5 20v-5h5v5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function OutdoorIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3 7.5 9h2.8L7 14h4v7M12 3l4.5 6h-2.8L17 14h-4v7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function OnboardingEnvironment({
  onSelect,
}: OnboardingEnvironmentProps) {
  return (
    <main className="onboarding-page">
      <section className="onboarding-shell">
        <p className="onboarding-step">
          Шаг 1 из 4
        </p>

        <div
          className="step-progress"
          aria-label="Шаг 1 из 4"
        >
          <span className="step-progress-segment is-active" />
          <span className="step-progress-segment" />
          <span className="step-progress-segment" />
          <span className="step-progress-segment" />
        </div>

        <h1 className="onboarding-title">
          Где ты тренируешься?
        </h1>

        <p className="onboarding-description">
          Я подберу программу и упражнения
          под твои условия.
        </p>

        <div className="choice-list">
          <button
            className="choice-row"
            type="button"
            onClick={() =>
              onSelect('gym')
            }
          >
            <span className="choice-icon">
              <GymIcon />
            </span>

            <span className="choice-label">
              В зале
            </span>

            <span className="choice-arrow">
              →
            </span>
          </button>

          <button
            className="choice-row"
            type="button"
            onClick={() =>
              onSelect('home')
            }
          >
            <span className="choice-icon">
              <HomeIcon />
            </span>

            <span className="choice-label">
              Дома
            </span>

            <span className="choice-arrow">
              →
            </span>
          </button>

          <button
            className="choice-row"
            type="button"
            onClick={() =>
              onSelect('outdoor')
            }
          >
            <span className="choice-icon">
              <OutdoorIcon />
            </span>

            <span className="choice-label">
              На улице
            </span>

            <span className="choice-arrow">
              →
            </span>
          </button>
        </div>
      </section>
    </main>
  )
}