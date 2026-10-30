import { createTelegramAuthHandler } from '../_shared/telegramAuthHandler.ts'

// Source preparation only. All valid requests still fail closed with HTTP 503.
// Never read VITE_*, service-role credentials, or signing keys in this foundation.
Deno.serve(createTelegramAuthHandler({
  getBotToken: () => Deno.env.get('TELEGRAM_BOT_TOKEN'),
}))
