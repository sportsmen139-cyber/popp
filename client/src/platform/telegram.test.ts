import { describe, expect, it, vi } from 'vitest'
import { getTelegramWebApp, initializeTelegram, setTelegramClosingConfirmation } from './telegram'

describe('optional Telegram lifecycle', () => {
  it('works without Telegram and does not require launch credentials', () => {
    expect(getTelegramWebApp({})).toBeNull()
    expect(getTelegramWebApp(null)).toBeNull()
    expect(() => { initializeTelegram(null); setTelegramClosingConfirmation(null, true) }).not.toThrow()
  })

  it('signals readiness and expands the native view', () => {
    const webApp = { ready: vi.fn(), expand: vi.fn() }
    expect(getTelegramWebApp({ Telegram: { WebApp: webApp } })).toBe(webApp)
    initializeTelegram(webApp)
    expect(webApp.ready).toHaveBeenCalledOnce()
    expect(webApp.expand).toHaveBeenCalledOnce()
  })

  it('continues initialization after a bridge failure', () => {
    const webApp = { ready: () => { throw new Error('Synthetic bridge failure') }, expand: vi.fn() }
    expect(() => initializeTelegram(webApp)).not.toThrow()
    expect(webApp.expand).toHaveBeenCalledOnce()
  })

  it('enables closing confirmation for a draft and disables it after completion', () => {
    const webApp = { isVersionAtLeast: vi.fn(() => true),
      enableClosingConfirmation: vi.fn(), disableClosingConfirmation: vi.fn() }
    setTelegramClosingConfirmation(webApp, true)
    setTelegramClosingConfirmation(webApp, false)
    expect(webApp.isVersionAtLeast).toHaveBeenCalledWith('6.2')
    expect(webApp.enableClosingConfirmation).toHaveBeenCalledOnce()
    expect(webApp.disableClosingConfirmation).toHaveBeenCalledOnce()
  })

  it('does not invoke unsupported native methods', () => {
    const webApp = { isVersionAtLeast: () => false, enableClosingConfirmation: vi.fn() }
    setTelegramClosingConfirmation(webApp, true)
    expect(webApp.enableClosingConfirmation).not.toHaveBeenCalled()
  })

  it('contains a native confirmation error', () => {
    expect(() => setTelegramClosingConfirmation({ enableClosingConfirmation: () => {
      throw new Error('Synthetic bridge failure')
    } }, true)).not.toThrow()
  })
})
