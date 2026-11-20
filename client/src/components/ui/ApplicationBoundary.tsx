import { Component } from 'react'
import type { ReactNode } from 'react'
import { LocalStorageError } from '../../storage/localStorage'
import { AppHeader } from './Primitives'

export class ApplicationBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="app">
        <section className="home">
          <AppHeader />
          <div className="unavailable-state" role="alert">
            <h1>Не удалось открыть приложение</h1>
            <p className="subtitle">
              {this.state.error instanceof LocalStorageError ? this.state.error.message :
                'Попробуй открыть приложение снова. Сохранённые записи не удалялись.'}
            </p>
            <button className="primary-button" onClick={() => window.location.reload()}>
              Открыть снова
            </button>
          </div>
        </section>
      </main>
    )
  }
}
