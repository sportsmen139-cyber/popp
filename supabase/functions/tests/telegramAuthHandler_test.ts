import assert from 'node:assert/strict'
import {
  createTelegramAuthHandler,
  MAX_AUTH_REQUEST_BYTES,
} from '../_shared/telegramAuthHandler.ts'
import { signedInitData, SYNTHETIC_BOT_TOKEN, TEST_NOW } from './synthetic.ts'

function handler(
  overrides: Partial<Parameters<typeof createTelegramAuthHandler>[0]> = {},
) {
  return createTelegramAuthHandler({
    getBotToken: () => SYNTHETIC_BOT_TOKEN,
    nowSeconds: () => TEST_NOW,
    ...overrides,
  })
}

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://edge.example.invalid/telegram-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

Deno.test('HTTP: valid initData still returns 503 without a session or JWT', async () => {
  const response = await handler()(request({ initData: signedInitData() }))
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'auth_session_not_implemented' })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.has('set-cookie'), false)
  assert.equal(response.headers.has('access-control-allow-origin'), false)
})

Deno.test('HTTP: a forged signature calls the real validator and returns generic 401', async () => {
  const response = await handler()(
    request({ initData: signedInitData().replace('synthetic-query', 'tampered') }),
  )
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'invalid_init_data' })
})

Deno.test('HTTP: ID-only, initDataUnsafe, nonstrings and extra identity fields are rejected', async () => {
  for (
    const body of [
      { user: { id: 42 } },
      { user_id: 42 },
      { initDataUnsafe: { user: { id: 42 } } },
      { initData: 42 },
      { initData: signedInitData(), user: { id: 43 } },
      null,
      [],
      {},
    ]
  ) {
    assert.equal((await handler()(request(body))).status, 400)
  }
})

Deno.test('HTTP: expired/missing-user/duplicate initData never establishes a session', async () => {
  for (
    const initData of [
      signedInitData({ auth_date: String(TEST_NOW - 301) }),
      signedInitData({ user: undefined }),
      signedInitData() + '&user=%7B%22id%22%3A43%7D',
    ]
  ) {
    assert.equal((await handler()(request({ initData }))).status, 401)
  }
})

Deno.test('HTTP: method, content type and browser origin are closed by default', async () => {
  const get = await handler()(new Request('https://edge.example.invalid/telegram-auth'))
  assert.equal(get.status, 405)
  assert.equal(get.headers.get('allow'), 'POST')
  assert.equal(
    (await handler()(request({}, { 'Content-Type': 'text/plain' }))).status,
    415,
  )
  const origin = await handler()(
    request({ initData: signedInitData() }, {
      Origin: 'https://client.example.invalid',
    }),
  )
  assert.equal(origin.status, 403)
  assert.equal(origin.headers.has('access-control-allow-origin'), false)
})

Deno.test('HTTP: missing, template or failing secret provider cannot authenticate', async () => {
  for (
    const getBotToken of [
      () => undefined,
      () => 'REPLACE_WITH_STAGING_BOT_TOKEN',
      () => {
        throw new Error('synthetic provider failure')
      },
    ]
  ) {
    const response = await handler({ getBotToken })(
      request({ initData: signedInitData() }),
    )
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'server_not_configured' })
  }
})

Deno.test('HTTP: request and validator size limits are both enforced', async () => {
  assert.equal(
    (await handler()(request({ initData: 'a'.repeat(MAX_AUTH_REQUEST_BYTES) }))).status,
    413,
  )
  assert.equal((await handler()(request({ initData: 'a'.repeat(8193) }))).status, 413)
  assert.equal(
    (await handler()(
      request({}, { 'Content-Length': String(MAX_AUTH_REQUEST_BYTES + 1) }),
    )).status,
    413,
  )
  assert.equal((await handler()(request({}, { 'Content-Length': '-1' }))).status, 400)
})

Deno.test('HTTP: streamed body is bounded even with missing or dishonest Content-Length', async () => {
  for (const contentLength of [undefined, '1']) {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024))
      },
      cancel() {
        cancelled = true
      },
    })
    const response = await handler()(
      new Request('https://edge.example.invalid/telegram-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(contentLength ? { 'Content-Length': contentLength } : {}),
        },
        body: stream,
      }),
    )
    assert.equal(response.status, 413)
    assert.equal(cancelled, true)
  }
})

Deno.test('HTTP: malformed JSON and invalid UTF-8 are rejected', async () => {
  for (const body of ['{', new Uint8Array([0xff])]) {
    const response = await handler()(
      new Request('https://edge.example.invalid/telegram-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
    )
    assert.equal(response.status, 400)
  }
})

Deno.test('HTTP: stalled streams time out and are cancelled without waiting on cancellation', async () => {
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true
      return new Promise<void>(() => {}) // Attacker-controlled hook never settles.
    },
  })
  const response = await handler({ bodyTimeoutMs: 5 })(
    new Request('https://edge.example.invalid/telegram-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
    }),
  )
  assert.equal(response.status, 408)
  assert.equal(cancelled, true)
})

Deno.test('HTTP: continuously ready empty chunks cannot bypass the body deadline', async () => {
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(0))
    },
  })
  const response = await handler({ bodyTimeoutMs: 5 })(
    new Request('https://edge.example.invalid/telegram-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
    }),
  )
  assert.equal(response.status, 408)
})

Deno.test('HTTP: no response reflects raw initData, identity, bot key, JWT or internal errors', async () => {
  const raw = signedInitData()
  const response = await handler()(request({ initData: raw }))
  const text = await response.text()
  for (
    const forbidden of [
      raw,
      SYNTHETIC_BOT_TOKEN,
      'telegramUserId',
      'redemptionDigest',
      'access_token',
      'refresh_token',
      'synthetic-query',
    ]
  ) {
    assert.equal(text.includes(forbidden), false)
  }
})

Deno.test('HTTP: neither successful validation nor invalid requests log credentials or payloads', async () => {
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const
  const originals = methods.map((method) => console[method])
  const captured: unknown[][] = []
  try {
    for (const method of methods) {
      console[method] = (...args: unknown[]) => {
        captured.push(args)
      }
    }
    await handler()(request({ initData: signedInitData() }))
    await handler()(
      request({ initData: signedInitData().replace('synthetic-query', 'tampered') }),
    )
    await handler()(request({ user_id: 42 }))
  } finally {
    methods.forEach((method, index) => {
      console[method] = originals[index]!
    })
  }
  assert.equal(captured.length, 0)
})
