import { useState } from 'react'
import { ActionButton, AppHeader, Icon } from '../../components/ui/Primitives'
import {
  copyFeedback,
  feedbackKinds,
  formatFeedback,
  openFeedbackChannel,
  ownerFeedbackUsername,
  parseFeedbackChannel,
} from './feedback'
import type { FeedbackChannel, FeedbackDraft, FeedbackPorts } from './feedback'
import './feedback.css'

function browserPorts(): FeedbackPorts {
  // The existing Mini App does not require the Telegram SDK to be present.
  const telegram = (
    window as Window & {
      Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } }
    }
  ).Telegram?.WebApp
  return {
    openTelegramLink:
      typeof telegram?.openTelegramLink === 'function'
        ? (url) => telegram.openTelegramLink!(url)
        : undefined,
    // A null result also occurs with noopener. Never claim delivery or successful opening.
    openExternal: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  }
}

export function FeedbackScreen({
  onBack,
  channel = parseFeedbackChannel(
    import.meta.env.VITE_FEEDBACK_TELEGRAM_USERNAME ?? ownerFeedbackUsername,
  ),
}: {
  onBack: () => void
  channel?: FeedbackChannel
}) {
  const [kind, setKind] = useState<FeedbackDraft['kind']>('bug')
  const [text, setText] = useState('')
  const [rating, setRating] = useState<number | undefined>()
  const [message, setMessage] = useState('')
  const [copying, setCopying] = useState(false)
  const draft = { kind, text, rating }
  const formatted = formatFeedback(draft)

  function open() {
    const result = openFeedbackChannel(channel, draft, browserPorts())
    setMessage(
      result === 'error'
        ? 'Не удалось открыть Telegram. Скопируй текст и отправь его вручную.'
        : result === 'unconfigured'
          ? 'Канал связи пока не настроен. Можно скопировать отзыв.'
          : result === 'invalid_draft'
            ? 'Напиши отзыв: от 1 до 2000 символов.'
            : 'Запрошено открытие Telegram. Проверь адресата и нажми «Отправить» в чате. Если текст не появился, скопируй его здесь.',
    )
  }

  async function copy() {
    if (!formatted) return
    setCopying(true)
    const ok = await copyFeedback(
      formatted,
      navigator.clipboard?.writeText.bind(navigator.clipboard),
    )
    setMessage(
      ok
        ? 'Текст скопирован. Отправь его в выбранный чат самостоятельно.'
        : 'Не удалось скопировать. Выдели текст в поле «Текст для отправки» и скопируй вручную.',
    )
    setCopying(false)
  }

  return (
    <main className="app">
      <section className="home feedback-screen">
        <AppHeader>
          <ActionButton variant="text" onClick={onBack}>
            <Icon name="back" />К плану
          </ActionButton>
        </AppHeader>
        <header className="page-intro">
          <div>
            <p className="eyebrow">Помоги сделать приложение лучше</p>
            <h1>Обратная связь</h1>
          </div>
        </header>
        <p className="subtitle">Расскажи, что получилось, а что стоит улучшить.</p>
        <form
          className="feedback-form"
          onSubmit={(event) => {
            event.preventDefault()
            open()
          }}
        >
          <label htmlFor="feedback-kind">О чём хочешь рассказать?</label>
          <select
            id="feedback-kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as FeedbackDraft['kind'])
              setMessage('')
            }}
          >
            {Object.entries(feedbackKinds).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {kind === 'usability' && (
            <>
              <label htmlFor="feedback-rating">
                Насколько удобно? <span>(необязательно)</span>
              </label>
              <select
                id="feedback-rating"
                value={rating ?? ''}
                onChange={(event) => {
                  setRating(event.target.value ? Number(event.target.value) : undefined)
                  setMessage('')
                }}
              >
                <option value="">Без оценки</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} из 5{value === 1 ? ' — неудобно' : value === 5 ? ' — очень удобно' : ''}
                  </option>
                ))}
              </select>
            </>
          )}
          <label htmlFor="feedback-text">Твой отзыв</label>
          <textarea
            id="feedback-text"
            required
            maxLength={2000}
            rows={6}
            value={text}
            aria-describedby="feedback-privacy feedback-count"
            onChange={(event) => {
              setText(event.target.value)
              setMessage('')
            }}
          />
          <p id="feedback-count" className="feedback-hint">
            {text.length} / 2000
          </p>
          <p id="feedback-privacy" className="feedback-hint">
            История тренировок, самочувствие и профиль не прикладываются. Не указывай в отзыве
            пароли и личные данные.
          </p>
          {channel.status === 'ready' ? (
            <p className="feedback-hint">
              Канал: @{channel.username}. Telegram может показать твой профиль адресату. Отправка —
              только после твоего действия в чате.
            </p>
          ) : (
            <p className="feedback-setup" role="note">
              Канал связи пока не настроен. Можно подготовить и скопировать отзыв. Приложение его не
              отправляет и не сохраняет.
            </p>
          )}
          <div className="feedback-actions">
            {channel.status === 'ready' && (
              <ActionButton type="submit" disabled={!formatted}>
                Открыть Telegram
              </ActionButton>
            )}
            <ActionButton
              variant="secondary"
              onClick={() => void copy()}
              disabled={!formatted || copying}
            >
              Скопировать текст
            </ActionButton>
          </div>
          {formatted && (
            <details className="feedback-preview">
              <summary>Текст для отправки</summary>
              <textarea aria-label="Текст для отправки" readOnly value={formatted} rows={8} />
            </details>
          )}
          <p role="status" className="feedback-status">
            {message}
          </p>
        </form>
        <p className="feedback-hint">При возвращении к плану текст отзыва будет сброшен.</p>
      </section>
    </main>
  )
}
