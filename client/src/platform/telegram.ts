/** Optional UI bridge only: no initData, identity, messages or backend credentials. */
export type TelegramWebApp = {
  ready?: () => void
  expand?: () => void
  isVersionAtLeast?: (version: string) => boolean
  enableClosingConfirmation?: () => void
  disableClosingConfirmation?: () => void
}

export function getTelegramWebApp(target: unknown): TelegramWebApp | null {
  const value = target as { Telegram?: { WebApp?: TelegramWebApp } } | null
  return value?.Telegram?.WebApp ?? null
}

export function initializeTelegram(webApp: TelegramWebApp | null): void {
  try { webApp?.ready?.() } catch { /* The browser app remains usable without a native bridge. */ }
  try { webApp?.expand?.() } catch { /* Older clients may not expose a working native bridge. */ }
}

export function setTelegramClosingConfirmation(webApp: TelegramWebApp | null, enabled: boolean): void {
  try {
    if (!webApp || webApp.isVersionAtLeast?.('6.2') === false) return
    if (enabled) webApp.enableClosingConfirmation?.()
    else webApp.disableClosingConfirmation?.()
  } catch { /* Local draft persistence does not depend on this optional native dialog. */ }
}
