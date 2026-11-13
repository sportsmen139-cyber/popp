export const feedbackKinds = {
  bug: 'Сообщить об ошибке',
  improvement: 'Предложить улучшение',
  usability: 'Оценить удобство',
  other: 'Свободный отзыв',
} as const

export type FeedbackDraft = {
  kind: keyof typeof feedbackKinds
  text: string
  rating?: number
}

export type FeedbackChannel =
  | { status: 'ready'; username: string }
  | { status: 'missing' | 'invalid' }

/** Public contact only. Never accept URLs, bot tokens, query strings or credentials. */
export function parseFeedbackChannel(value: unknown): FeedbackChannel {
  if (value === undefined || value === '') return { status: 'missing' }
  if (typeof value !== 'string') return { status: 'invalid' }
  const username = value.trim().replace(/^@/, '')
  if (!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username)) return { status: 'invalid' }
  return { status: 'ready', username }
}

export function formatFeedback(draft: FeedbackDraft): string | null {
  if (!Object.hasOwn(feedbackKinds, draft.kind) || typeof draft.text !== 'string') return null
  const text = draft.text.trim()
  if (!text || text.length > 2000 || /[\uD800-\uDFFF]/u.test(text)) return null
  if (
    draft.rating !== undefined &&
    (!Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5)
  )
    return null
  return [
    'Отзыв об альфа-версии',
    `Тип: ${feedbackKinds[draft.kind]}`,
    ...(draft.kind === 'usability' && draft.rating !== undefined
      ? [`Удобство: ${draft.rating} из 5`]
      : []),
    '',
    text,
  ].join('\n')
}

export function buildFeedbackLink(channel: FeedbackChannel, text: string): string | null {
  // Recheck at the adapter boundary, even when called from outside the form.
  if (channel.status !== 'ready' || !text.trim()) return null
  const checked = parseFeedbackChannel(channel.username)
  if (checked.status !== 'ready') return null
  return `https://t.me/${checked.username}?text=${encodeURIComponent(text)}`
}

export type FeedbackPorts = {
  openTelegramLink?: (url: string) => void
  openExternal: (url: string) => void
}

export function openFeedbackChannel(
  channel: FeedbackChannel,
  draft: FeedbackDraft,
  ports: FeedbackPorts,
):
  | 'telegram_open_requested'
  | 'browser_open_requested'
  | 'unconfigured'
  | 'invalid_draft'
  | 'error' {
  if (channel.status !== 'ready') return 'unconfigured'
  const text = formatFeedback(draft)
  if (!text) return 'invalid_draft'
  const url = buildFeedbackLink(channel, text)
  if (!url) return 'unconfigured'
  try {
    if (ports.openTelegramLink) {
      ports.openTelegramLink(url)
      return 'telegram_open_requested'
    }
    ports.openExternal(url)
    return 'browser_open_requested'
  } catch {
    return 'error'
  }
}

export async function copyFeedback(
  text: string,
  writeText?: (text: string) => Promise<void>,
): Promise<boolean> {
  if (!writeText) return false
  try {
    await writeText(text)
    return true
  } catch {
    return false
  }
}
