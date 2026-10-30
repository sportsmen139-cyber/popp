import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  MAX_FUTURE_SKEW_SECONDS,
  MAX_INIT_DATA_AGE_SECONDS,
  MAX_INIT_DATA_BYTES,
  validateTelegramInitData,
} from '../_shared/telegramInitData.ts'
import { signedInitData, SYNTHETIC_BOT_TOKEN, TEST_NOW } from './synthetic.ts'

const validate = (raw: unknown, key = SYNTHETIC_BOT_TOKEN, now = TEST_NOW) =>
  validateTelegramInitData(raw, key, now)

Deno.test('HMAC: matches an independently calculated fixed Python vector', async () => {
  const raw =
    'user=%7B%22id%22%3A42%7D&auth_date=1900000000&query_id=synthetic-query&hash=' +
    '9085cfa5dfad46d6d0b511d713b1086d9c0760723b692c46099aed17371ea952'
  assert.equal(signedInitData(), raw)
  const result = await validate(raw)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error('Synthetic reference must verify')
  assert.equal(result.telegramUserId, '42')
  assert.equal(result.authDate, TEST_NOW)
  assert.equal(result.expiresAt, TEST_NOW + MAX_INIT_DATA_AGE_SECONDS)
  assert.match(result.redemptionDigest, /^[a-f0-9]{64}$/)
  assert.deepEqual(Object.keys(result).sort(), [
    'authDate',
    'expiresAt',
    'ok',
    'redemptionDigest',
    'telegramUserId',
  ])
})

Deno.test('HMAC: key order, hash placement/case and equivalent URL encoding are canonical', async () => {
  const original = signedInitData({ start_param: 'one two+three=四🙂' })
  const fields = original.split('&').reverse()
  const reordered = fields.map((field) =>
    field.startsWith('hash=')
      ? field.toUpperCase().replace('HASH=', 'hash=')
      : field.replace(/\+/g, '%20')
  ).join('&')
  assert.deepEqual(await validate(reordered), await validate(original))
})

Deno.test('HMAC: user JSON and all unknown fields are signed verbatim, not reserialized', async () => {
  const user = '{"id":42,"first_name":"Synthetic 😺","last_name":"A+B"}'
  assert.equal(
    (await validate(signedInitData({ user, start_param: 's', extra: 'x=y' }))).ok,
    true,
  )
  const altered = new URLSearchParams(signedInitData({ user }))
  altered.set('user', JSON.stringify(JSON.parse(user), null, 1).replace(/\n/g, ''))
  assert.deepEqual(await validate(altered.toString()), {
    ok: false,
    code: 'invalid_signature',
  })
})

Deno.test('HMAC: changing any signed content fails', async () => {
  for (
    const [key, value] of [['user', '{"id":43}'], ['auth_date', String(TEST_NOW - 1)], [
      'query_id',
      'changed',
    ]]
  ) {
    const params = new URLSearchParams(signedInitData())
    params.set(key!, value!)
    assert.deepEqual(await validate(params.toString()), {
      ok: false,
      code: 'invalid_signature',
    })
  }
})

Deno.test('HMAC: wrong bot token fails native cryptographic verification', async () => {
  assert.deepEqual(await validate(signedInitData(), 'different-synthetic-test-key'), {
    ok: false,
    code: 'invalid_signature',
  })
})

Deno.test('HMAC: wrong hash of correct length fails', async () => {
  const params = new URLSearchParams(signedInitData())
  params.set('hash', '00'.repeat(32))
  assert.deepEqual(await validate(params.toString()), {
    ok: false,
    code: 'invalid_signature',
  })
})

Deno.test('HMAC: missing and malformed hash are rejected', async () => {
  const params = new URLSearchParams(signedInitData())
  params.delete('hash')
  assert.deepEqual(await validate(params.toString()), {
    ok: false,
    code: 'missing_hash',
  })
  for (const hash of ['', 'aa', 'z'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) {
    params.set('hash', hash)
    assert.deepEqual(await validate(params.toString()), {
      ok: false,
      code: 'invalid_hash',
    })
  }
})

Deno.test('HMAC: duplicate decoded keys, including encoded hash aliases, are rejected', async () => {
  for (
    const duplicate of [
      '&hash=' + 'aa'.repeat(32),
      '&%68ash=' + 'aa'.repeat(32),
      '&auth_date=1',
      '&user=%7B%22id%22%3A43%7D',
    ]
  ) {
    assert.deepEqual(await validate(signedInitData() + duplicate), {
      ok: false,
      code: 'duplicate_parameter',
    })
  }
})

Deno.test('HMAC: signature is included; this is not the Ed25519 third-party algorithm', async () => {
  const raw = signedInitData({
    signature: 'synthetic-ed25519-field-not-a-real-signature',
  })
  assert.equal((await validate(raw)).ok, true)
  const params = new URLSearchParams(raw)
  params.set('signature', 'changed')
  assert.deepEqual(await validate(params.toString()), {
    ok: false,
    code: 'invalid_signature',
  })
  const unsigned = new URLSearchParams(signedInitData())
  unsigned.set('signature', 'synthetic-ed25519-field-not-a-real-signature')
  assert.deepEqual(await validate(unsigned.toString()), {
    ok: false,
    code: 'invalid_signature',
  })
})

Deno.test('HMAC: wrong derivation order, raw bot key and Ed25519-style prefix are not accepted', async () => {
  const params = new URLSearchParams(signedInitData())
  params.delete('hash')
  const check = [...params.keys()].sort().map((key) => `${key}=${params.get(key)}`)
    .join('\n')
  const reversed = createHmac('sha256', SYNTHETIC_BOT_TOKEN).update('WebAppData')
    .digest()
  const derived = createHmac('sha256', 'WebAppData').update(SYNTHETIC_BOT_TOKEN)
    .digest()
  for (
    const hash of [
      createHmac('sha256', reversed).update(check).digest('hex'),
      createHmac('sha256', SYNTHETIC_BOT_TOKEN).update(check).digest('hex'),
      createHmac('sha256', derived).update('42:WebAppData\n' + check).digest('hex'),
    ]
  ) {
    params.set('hash', hash)
    assert.deepEqual(await validate(params.toString()), {
      ok: false,
      code: 'invalid_signature',
    })
  }
})

Deno.test('time: expiry and future skew boundaries are explicit', async () => {
  assert.equal(
    (await validate(signedInitData({ auth_date: String(TEST_NOW - 300) }))).ok,
    true,
  )
  assert.deepEqual(
    await validate(signedInitData({ auth_date: String(TEST_NOW - 301) })),
    { ok: false, code: 'expired' },
  )
  assert.equal(
    (await validate(
      signedInitData({ auth_date: String(TEST_NOW + MAX_FUTURE_SKEW_SECONDS) }),
    )).ok,
    true,
  )
  assert.deepEqual(
    await validate(signedInitData({ auth_date: String(TEST_NOW + 31) })),
    { ok: false, code: 'future_auth_date' },
  )
})

Deno.test('time: missing, noninteger, exponent and malformed auth_date fail', async () => {
  for (
    const auth_date of [
      undefined,
      '',
      '0',
      '-1',
      '1.5',
      '1e9',
      '01900000000',
      'NaN',
      '999999999999999999',
    ]
  ) {
    assert.deepEqual(await validate(signedInitData({ auth_date })), {
      ok: false,
      code: 'invalid_auth_date',
    })
  }
})

Deno.test('identity: missing user fails even with a valid signature', async () => {
  assert.deepEqual(await validate(signedInitData({ user: undefined })), {
    ok: false,
    code: 'missing_user',
  })
})

Deno.test('identity: invalid JSON, non-object, unsafe/nonpositive/string IDs and bots fail', async () => {
  for (
    const user of [
      '{',
      'null',
      '[]',
      '{}',
      '"user"',
      '{"id":"42"}',
      '{"id":0}',
      '{"id":-1}',
      '{"id":1.5}',
      '{"id":9007199254740992}',
      '{"id":42,"is_bot":true}',
    ]
  ) {
    assert.deepEqual(await validate(signedInitData({ user })), {
      ok: false,
      code: 'invalid_user',
    })
  }
})

Deno.test('identity: safe IDs above 32 bits are retained exactly as decimal strings', async () => {
  const result = await validate(
    signedInitData({ user: '{"id":4503599627370495,"is_bot":false}' }),
  )
  assert.equal(result.ok && result.telegramUserId, '4503599627370495')
})

Deno.test('encoding: malformed URL encoding/UTF-8 and LF injection fail before verification', async () => {
  for (
    const part of ['%ZZ', '%', '%C0%AF', '%FF', '%E0%A4', 'a%0Ab%3Dc', 'a%0Db', 'a%00b']
  ) {
    assert.deepEqual(await validate(signedInitData() + '&extra=' + part), {
      ok: false,
      code: 'invalid_payload',
    })
  }
  for (const suffix of ['&', '&no_equals', '&=x', '&bad-key=x']) {
    assert.deepEqual(await validate(signedInitData() + suffix), {
      ok: false,
      code: 'invalid_payload',
    })
  }
  assert.deepEqual(await validate(signedInitData() + '&extra=\ud800'), {
    ok: false,
    code: 'invalid_payload',
  })
})

Deno.test('limits: reject oversize strings and UTF-8 payloads by bytes, not characters', async () => {
  assert.deepEqual(await validate('a'.repeat(MAX_INIT_DATA_BYTES + 1)), {
    ok: false,
    code: 'payload_too_large',
  })
  assert.deepEqual(await validate('user=' + '🙂'.repeat(MAX_INIT_DATA_BYTES / 4)), {
    ok: false,
    code: 'payload_too_large',
  })
})

Deno.test('input: only raw signed strings, never user IDs or initDataUnsafe objects', async () => {
  for (
    const raw of [undefined, null, 42, { user: { id: 42 } }, {
      initDataUnsafe: { user: { id: 42 } },
    }, '']
  ) {
    assert.deepEqual(await validate(raw), { ok: false, code: 'invalid_payload' })
  }
  assert.equal((await validate('user=%7B%22id%22%3A42%7D')).ok, false)
})

Deno.test('configuration: empty/invalid server key or clock fail closed', async () => {
  for (const key of ['', 'key\n', ' key', 'x'.repeat(4097)]) {
    assert.deepEqual(await validate(signedInitData(), key), {
      ok: false,
      code: 'invalid_server_configuration',
    })
  }
  assert.deepEqual(await validate(signedInitData(), SYNTHETIC_BOT_TOKEN, NaN), {
    ok: false,
    code: 'invalid_server_configuration',
  })
})

Deno.test('stateless boundary: equivalent replay data is not falsely marked one-time redeemed', async () => {
  const raw = signedInitData()
  const first = await validate(raw)
  assert.deepEqual(await validate(raw), first)
  assert.deepEqual(await validate(raw.split('&').reverse().join('&')), first)
  // Future atomic DB redemption, not this validator, must enforce one-time exchange.
})
