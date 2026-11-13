import { Component, type ReactNode } from 'react'
import { ActionButton, AppHeader, Icon } from './Primitives'
import { useScreenFocus } from './useScreenFocus'

function ProgressError({ onBack }: { onBack: () => void }) {
  useScreenFocus('progress-error')
  return (
    <main className="app">
      <section className="home">
        <AppHeader />
        <div className="unavailable-state">
          <p className="eyebrow">Не удалось загрузить экран</p>
          <h1>Прогресс не открылся</h1>
          <p className="subtitle">
            Записи на устройстве не изменены. Проверь соединение и обнови страницу.
          </p>
          <div className="error-actions">
            <ActionButton onClick={onBack}>
              <Icon name="back" />К тренировке
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => window.location.reload()}>
              Обновить страницу
            </ActionButton>
          </div>
        </div>
      </section>
    </main>
  )
}

/** UI/chunk recovery only: no storage reads, writes or domain error rewriting. */
export class ProgressBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <ProgressError onBack={this.props.onBack} /> : this.props.children
  }
}
