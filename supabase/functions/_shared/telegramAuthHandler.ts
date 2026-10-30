import { validateTelegramInitData } from './telegramInitData.ts'

export const MAX_AUTH_REQUEST_BYTES = 16 * 1024
const DEFAULT_BODY_TIMEOUT_MS = 5000

class BodyError extends Error {
  constructor(
    readonly code: 'invalid_request' | 'payload_too_large' | 'request_timeout',
  ) {
    super(code)
  }
}

function respond(code: string, status: number): Response {
  return Response.json({ error: code }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(status === 405 ? { Allow: 'POST' } : {}),
    },
  })
}

async function boundedBody(request: Request, timeoutMs: number): Promise<string> {
  const length = request.headers.get('content-length')
  if (length !== null) {
    if (!/^[0-9]+$/.test(length)) throw new BodyError('invalid_request')
    if (Number(length) > MAX_AUTH_REQUEST_BYTES) {
      throw new BodyError('payload_too_large')
    }
  }
  if (!request.body) throw new BodyError('invalid_request')
  const reader = request.body.getReader()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BodyError('request_timeout')), timeoutMs)
  })
  const chunks: Uint8Array[] = []
  let size = 0
  const startedAt = performance.now()
  try {
    while (true) {
      // Also bound continuously-ready/empty chunks: microtasks can starve timers.
      if (performance.now() - startedAt >= timeoutMs) {
        throw new BodyError('request_timeout')
      }
      const { value, done } = await Promise.race([reader.read(), deadline])
      if (done) break
      if (value.byteLength === 0) continue
      size += value.byteLength
      if (size > MAX_AUTH_REQUEST_BYTES) throw new BodyError('payload_too_large')
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } finally {
    clearTimeout(timer)
    // Never await an attacker-controlled stream's cancellation hook.
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export function createTelegramAuthHandler(options: {
  getBotToken: () => string | undefined
  nowSeconds?: () => number
  bodyTimeoutMs?: number
}): (request: Request) => Promise<Response> {
  return async (request) => {
    // Browser transport/origin policy is deliberately not guessed in Stage 2A.
    // No CORS headers/cookie/session endpoint is enabled by this foundation.
    if (request.headers.has('origin')) {
      return respond('browser_transport_not_configured', 403)
    }
    if (request.method !== 'POST') return respond('method_not_allowed', 405)
    if (
      request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
    ) {
      return respond('unsupported_media_type', 415)
    }
    let botToken: string | undefined
    try {
      botToken = options.getBotToken()
    } catch {
      return respond('server_not_configured', 503)
    }
    const bodyTimeoutMs = options.bodyTimeoutMs ?? DEFAULT_BODY_TIMEOUT_MS
    if (
      !botToken || botToken === 'REPLACE_WITH_STAGING_BOT_TOKEN' ||
      !Number.isSafeInteger(bodyTimeoutMs) || bodyTimeoutMs < 1 ||
      bodyTimeoutMs > DEFAULT_BODY_TIMEOUT_MS
    ) return respond('server_not_configured', 503)

    let body: unknown
    try {
      body = JSON.parse(await boundedBody(request, bodyTimeoutMs))
    } catch (error) {
      if (error instanceof BodyError) {
        return respond(
          error.code,
          error.code === 'payload_too_large'
            ? 413
            : error.code === 'request_timeout'
            ? 408
            : 400,
        )
      }
      return respond('invalid_request', 400)
    }
    if (
      typeof body !== 'object' || body === null || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !('initData' in body) ||
      typeof body.initData !== 'string'
    ) return respond('invalid_request', 400)

    const result = await validateTelegramInitData(
      body.initData,
      botToken,
      options.nowSeconds?.(),
    )
    if (!result.ok) {
      if (result.code === 'invalid_server_configuration') {
        return respond('server_not_configured', 503)
      }
      return respond(
        result.code === 'payload_too_large' ? 'payload_too_large' : 'invalid_init_data',
        result.code === 'payload_too_large' ? 413 : 401,
      )
    }
    // No session store, replay redemption or project-verified signing key yet.
    // A cryptographically valid Telegram identity must NOT become a working login.
    return respond('auth_session_not_implemented', 503)
  }
}
