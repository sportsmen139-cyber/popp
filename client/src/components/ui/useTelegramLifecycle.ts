import { useEffect, useRef } from 'react'
import { getTelegramWebApp, initializeTelegram, setTelegramClosingConfirmation } from '../../platform/telegram'
import type { TelegramWebApp } from '../../platform/telegram'

export function useTelegramLifecycle(hasDraft: boolean) {
  const initialized = useRef<TelegramWebApp | null>(null)
  useEffect(() => {
    const script = document.getElementById('telegram-webapp-sdk')
    const sync = () => {
      const webApp = getTelegramWebApp(window)
      if (webApp && initialized.current !== webApp) {
        initializeTelegram(webApp)
        initialized.current = webApp
      }
      setTelegramClosingConfirmation(webApp, hasDraft)
    }
    sync()
    script?.addEventListener('load', sync)
    return () => {
      script?.removeEventListener('load', sync)
      setTelegramClosingConfirmation(getTelegramWebApp(window), false)
    }
  }, [hasDraft])
}
