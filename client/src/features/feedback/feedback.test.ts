import { describe, expect, it, vi } from 'vitest'
import {
  buildFeedbackLink,
  copyFeedback,
  formatFeedback,
  openFeedbackChannel,
  parseFeedbackChannel,
} from './feedback'
import type { FeedbackDraft } from './feedback'

const draft: FeedbackDraft = { kind: 'bug', text: 'Не могу вернуться к плану' }
const channel = parseFeedbackChannel('synthetic_alpha_contact')

describe('alpha feedback', () => {
  it('does not invent a missing recipient', () => {
    expect(parseFeedbackChannel(undefined)).toEqual({ status: 'missing' })
    expect(parseFeedbackChannel('')).toEqual({ status: 'missing' })
    expect(buildFeedbackLink({ status: 'missing' }, 'text')).toBeNull()
  })
  it('accepts a username and normalizes an optional @', () => {
    expect(parseFeedbackChannel(' @synthetic_alpha_contact ')).toEqual(channel)
  })
  it.each([
    'https://t.me/someone',
    'person?text=other',
    '../x',
    'ab',
    '12345',
    123,
    'имя_тест',
    'user\nname',
  ])('rejects invalid contact %s', (value) => {
    expect(parseFeedbackChannel(value).status).toBe('invalid')
  })
  it('encodes the entire draft without changing the recipient or injecting parameters', () => {
    const text = 'Привет &start=x\n?text=замена #one 😀'
    const link = new URL(buildFeedbackLink(channel, text)!)
    expect(link.origin).toBe('https://t.me')
    expect(link.pathname).toBe('/synthetic_alpha_contact')
    expect([...link.searchParams.entries()]).toEqual([['text', text]])
    expect(link.hash).toBe('')
  })
  it('rechecks a malformed ready channel at the boundary', () => {
    expect(buildFeedbackLink({ status: 'ready', username: 'user?x=1' }, 'text')).toBeNull()
  })
  it('requests Telegram handoff using the real generated link', () => {
    const openTelegramLink = vi.fn()
    const openExternal = vi.fn()
    expect(openFeedbackChannel(channel, draft, { openTelegramLink, openExternal })).toBe(
      'telegram_open_requested',
    )
    expect(openTelegramLink).toHaveBeenCalledWith(
      buildFeedbackLink(channel, formatFeedback(draft)!),
    )
    expect(openExternal).not.toHaveBeenCalled()
  })
  it('works without Telegram SDK via the browser adapter', () => {
    const openExternal = vi.fn()
    expect(openFeedbackChannel(channel, draft, { openExternal })).toBe('browser_open_requested')
    expect(openExternal).toHaveBeenCalledOnce()
  })
  it('reports a handoff error without claiming delivery', () => {
    expect(
      openFeedbackChannel(channel, draft, {
        openTelegramLink: () => {
          throw new Error('bridge failure')
        },
        openExternal: vi.fn(),
      }),
    ).toBe('error')
    expect(
      openFeedbackChannel(channel, draft, {
        openExternal: () => {
          throw new Error('blocked')
        },
      }),
    ).toBe('error')
  })
  it('does not invoke transport when configuration is absent', () => {
    const openExternal = vi.fn()
    expect(openFeedbackChannel({ status: 'missing' }, draft, { openExternal })).toBe('unconfigured')
    expect(openExternal).not.toHaveBeenCalled()
  })
  it.each(['', '   ', 'a'.repeat(2001), '\uD800'])(
    'does not open a channel for invalid text',
    (text) => {
      const openExternal = vi.fn()
      expect(openFeedbackChannel(channel, { ...draft, text }, { openExternal })).toBe(
        'invalid_draft',
      )
      expect(openExternal).not.toHaveBeenCalled()
    },
  )
  it('formats usability ratings only when explicitly provided and in range', () => {
    expect(formatFeedback({ kind: 'usability', text: 'Нравится', rating: 4 })).toContain(
      'Удобство: 4 из 5',
    )
    expect(formatFeedback({ kind: 'usability', text: 'Нравится' })).not.toContain('Удобство:')
    expect(formatFeedback({ ...draft, rating: 3 })).not.toContain('Удобство:')
    for (const rating of [0, 6, 1.5, NaN]) expect(formatFeedback({ ...draft, rating })).toBeNull()
  })
  it('only serializes user-entered feedback, never arbitrary diagnostic/profile/history fields', () => {
    const value = {
      ...draft,
      history: ['PRIVATE_WORKOUT'],
      user: { id: 'PRIVATE_ID' },
      profile: 'PRIVATE_PROFILE',
      initData: 'PRIVATE_INIT_DATA',
    }
    expect(formatFeedback(value)).toBe(
      `Отзыв об альфа-версии\nТип: Сообщить об ошибке\n\n${draft.text}`,
    )
  })
  it('copies through the clipboard adapter and handles absence/rejection', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    expect(await copyFeedback('draft', write)).toBe(true)
    expect(write).toHaveBeenCalledWith('draft')
    expect(await copyFeedback('draft')).toBe(false)
    expect(
      await copyFeedback('draft', async () => {
        throw new Error('permission denied')
      }),
    ).toBe(false)
  })
})
