import { createHmac } from 'node:crypto'

// Arbitrary test-only key, deliberately not a Telegram token or an account credential.
export const SYNTHETIC_BOT_TOKEN = 'synthetic-stage2a-key-for-tests-only'
export const TEST_NOW = 1_900_000_000

/** Independent Node HMAC oracle, not the implementation's verification helpers. */
export function signedInitData(
  patch: Record<string, string | undefined> = {},
  botToken = SYNTHETIC_BOT_TOKEN,
): string {
  const fields: Record<string, string> = {
    user: JSON.stringify({ id: 42 }),
    auth_date: String(TEST_NOW),
    query_id: 'synthetic-query',
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete fields[key]
    else fields[key] = value
  }
  const check = Object.keys(fields).sort().map((key) => `${key}=${fields[key]}`).join(
    '\n',
  )
  const key = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', key).update(check).digest('hex')
  return `${new URLSearchParams(fields)}&hash=${hash}`
}
