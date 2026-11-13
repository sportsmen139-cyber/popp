import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Brand } from './Brand'

type IconName = 'arrow' | 'back' | 'progress' | 'profile' | 'check' | 'clock'
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    back: <path d="M20 12H5m6-6-6 6 6 6" />,
    progress: (
      <>
        <path d="M4 4v16h16M8 15l4-5 4 2 4-6" />
        <path d="M16 6h4v4" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  }
  return (
    <svg
      className={`ui-icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="app-header">
      <Brand />
      <nav className="header-actions" aria-label="Навигация">
        {children}
      </nav>
    </header>
  )
}

export function ActionButton({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'text' }) {
  return (
    <button
      type="button"
      className={`action-button action-button--${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function OptionButton({
  selected = false,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`session-feeling-button ${selected ? 'is-selected' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function SelectionGroup({
  number,
  label,
  children,
}: {
  number: string
  label: string
  children: ReactNode
}) {
  return (
    <fieldset className="selection-group">
      <legend>
        <span className="section-number" aria-hidden="true">
          {number}
        </span>
        {label}
      </legend>
      {children}
    </fieldset>
  )
}

export function EquipmentNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <details className="equipment-note">
      <summary>План предварительный · оборудование не указано</summary>
      <p role="note">{message}</p>
    </details>
  )
}

export function OnboardingShell({
  step,
  title,
  description,
  onBack,
  children,
}: {
  step: 1 | 2 | 3 | 4
  title: string
  description: string
  onBack?: () => void
  children: ReactNode
}) {
  return (
    <main className="onboarding-page">
      <section className="onboarding-shell">
        <AppHeader>
          {onBack && (
            <ActionButton variant="text" onClick={onBack}>
              <Icon name="back" />
              Назад
            </ActionButton>
          )}
        </AppHeader>
        <div className="onboarding-progress" aria-label={`Шаг ${step} из 4`}>
          <span className="eyebrow">Настройка плана</span>
          <span className="onboarding-count">
            0{step}
            <span> / 04</span>
          </span>
          <div className="step-progress" aria-hidden="true">
            {[1, 2, 3, 4].map((segment) => (
              <span
                key={segment}
                className={`step-progress-segment ${segment <= step ? 'is-active' : ''}`}
              />
            ))}
          </div>
        </div>
        <h1 className="onboarding-title">{title}</h1>
        <p className="onboarding-description">{description}</p>
        {children}
        <p className="onboarding-footnote">Настройки можно изменить в профиле.</p>
      </section>
    </main>
  )
}

export function OnboardingChoice({
  number,
  label,
  hint,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { number: string; label: string; hint: string }) {
  return (
    <button type="button" className="choice-row" aria-label={label} {...props}>
      <span className="choice-number" aria-hidden="true">
        {number}
      </span>
      <span className="choice-content">
        <strong>{label}</strong>
        <span>{hint}</span>
      </span>
      <Icon name="arrow" />
    </button>
  )
}
