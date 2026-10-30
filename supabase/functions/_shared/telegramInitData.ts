/** Telegram Mini App HMAC validation only. This does not establish an app session. */
export const MAX_INIT_DATA_BYTES = 8 * 1024
export const MAX_INIT_DATA_AGE_SECONDS = 300
export const MAX_FUTURE_SKEW_SECONDS = 30

type FailureCode =
  | 'invalid_server_configuration'
  | 'invalid_payload'
  | 'payload_too_large'
  | 'duplicate_parameter'
  | 'missing_hash'
  | 'invalid_hash'
  | 'invalid_signature'
  | 'invalid_auth_date'
  | 'expired'
  | 'future_auth_date'
  | 'missing_user'
  | 'invalid_user'

export type TelegramInitDataResult =
  | {
    ok: true
    telegramUserId: string
    authDate: number
    expiresAt: number
    /** Canonical replay identity; must be atomically redeemed by a future store. */
    redemptionDigest: string
  }
  | { ok: false; code: FailureCode }

const encoder = new TextEncoder()
const controls = /\p{Cc}/u

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Strict form decoding: URLSearchParams alone silently repairs broken encodings. */
function decodePart(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, ' '))
}

export async function validateTelegramInitData(
  raw: unknown,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<TelegramInitDataResult> {
  if (
    typeof botToken !== 'string' || botToken.length === 0 ||
    botToken.length > 4096 || controls.test(botToken) ||
    botToken.trim() !== botToken ||
    !Number.isSafeInteger(nowSeconds) || nowSeconds <= 0
  ) return { ok: false, code: 'invalid_server_configuration' }

  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, code: 'invalid_payload' }
  }
  // Bound the string before allocating its UTF-8 representation.
  if (raw.length > MAX_INIT_DATA_BYTES) return { ok: false, code: 'payload_too_large' }
  const rawBytes = encoder.encode(raw)
  if (rawBytes.length > MAX_INIT_DATA_BYTES) {
    return { ok: false, code: 'payload_too_large' }
  }
  // Reject unpaired JS surrogates as well as invalid percent-encoded UTF-8.
  if (new TextDecoder().decode(rawBytes) !== raw) {
    return { ok: false, code: 'invalid_payload' }
  }

  const fields = new Map<string, string>()
  try {
    for (const pair of raw.split('&')) {
      const separator = pair.indexOf('=')
      if (separator <= 0) return { ok: false, code: 'invalid_payload' }
      const name = decodePart(pair.slice(0, separator))
      const value = decodePart(pair.slice(separator + 1))
      // Protocol keys are ASCII. LF/control rejection prevents ambiguous check strings.
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) || controls.test(value)) {
        return { ok: false, code: 'invalid_payload' }
      }
      if (fields.has(name)) return { ok: false, code: 'duplicate_parameter' }
      fields.set(name, value)
    }
  } catch {
    return { ok: false, code: 'invalid_payload' }
  }

  const hash = fields.get('hash')
  if (hash === undefined) return { ok: false, code: 'missing_hash' }
  if (!/^[a-fA-F0-9]{64}$/.test(hash)) return { ok: false, code: 'invalid_hash' }
  const signature = Uint8Array.from(
    { length: 32 },
    (_, index) => Number.parseInt(hash.slice(index * 2, index * 2 + 2), 16),
  )
  // HMAC excludes ONLY hash. If present, signature is an ordinary signed field.
  // Ed25519 third-party validation has a different prefix/key/exclusion contract.
  const dataCheckString = [...fields.keys()]
    .filter((name) => name !== 'hash')
    .sort() // ASCII key order, never locale-dependent sorting.
    .map((name) => `${name}=${fields.get(name)}`)
    .join('\n')

  try {
    const derivationKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const secret = await crypto.subtle.sign(
      'HMAC',
      derivationKey,
      encoder.encode(botToken),
    )
    const verificationKey = await crypto.subtle.importKey(
      'raw',
      secret,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    // Use native cryptographic verification, not JS string/early-exit byte comparison.
    if (
      !await crypto.subtle.verify(
        'HMAC',
        verificationKey,
        signature,
        encoder.encode(dataCheckString),
      )
    ) {
      return { ok: false, code: 'invalid_signature' }
    }
  } catch {
    return { ok: false, code: 'invalid_server_configuration' }
  }

  const authDateText = fields.get('auth_date')
  if (!authDateText || !/^[1-9][0-9]{0,10}$/.test(authDateText)) {
    return { ok: false, code: 'invalid_auth_date' }
  }
  const authDate = Number(authDateText)
  if (!Number.isSafeInteger(authDate)) return { ok: false, code: 'invalid_auth_date' }
  if (authDate > nowSeconds + MAX_FUTURE_SKEW_SECONDS) {
    return { ok: false, code: 'future_auth_date' }
  }
  if (nowSeconds - authDate > MAX_INIT_DATA_AGE_SECONDS) {
    return { ok: false, code: 'expired' }
  }

  const userText = fields.get('user')
  if (userText === undefined) return { ok: false, code: 'missing_user' }
  let user: unknown
  try {
    user = JSON.parse(userText)
  } catch {
    return { ok: false, code: 'invalid_user' }
  }
  if (
    typeof user !== 'object' || user === null || Array.isArray(user) ||
    !('id' in user) || typeof user.id !== 'number' ||
    !Number.isSafeInteger(user.id) || user.id <= 0 ||
    ('is_bot' in user && user.is_bot !== false)
  ) return { ok: false, code: 'invalid_user' }

  // Do not hash the raw URL: reordering / equivalent percent encoding must not
  // create distinct redemption IDs for the same verified launch data.
  const redemptionDigest = bytesToHex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', signature)),
  )
  return {
    ok: true,
    telegramUserId: String(user.id),
    authDate,
    expiresAt: authDate + MAX_INIT_DATA_AGE_SECONDS,
    redemptionDigest,
  }
}
