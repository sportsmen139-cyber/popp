import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createPublicKey, verify } from 'node:crypto'

// Local cryptographic PoC only: no signing code or key is exported to the gateway.
// Supabase project acceptance, claims enforcement and RLS are NOT proven by this.
Deno.test('ES256 PoC: ephemeral P-256 JWT has JOSE signature accepted by independent Node crypto', async () => {
  const keys = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  const publicSpki = await crypto.subtle.exportKey('spki', keys.publicKey)
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    sub: crypto.randomUUID(),
    sid: crypto.randomUUID(),
    role: 'authenticated',
    iss: 'https://synthetic-gateway.example.invalid',
    aud: 'authenticated',
    iat: now,
    nbf: now,
    exp: now + 600,
  }
  const header = { alg: 'ES256', typ: 'JWT', kid: 'synthetic-ephemeral-test-key' }
  const unsigned = `${encode(header)}.${encode(claims)}`
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keys.privateKey,
      new TextEncoder().encode(unsigned),
    ),
  )
  assert.equal(signature.length, 64) // JOSE r||s, not ASN.1 DER.
  const key = createPublicKey({
    key: Buffer.from(publicSpki),
    format: 'der',
    type: 'spki',
  })
  assert.equal(
    verify(
      'sha256',
      Buffer.from(unsigned),
      { key, dsaEncoding: 'ieee-p1363' },
      signature,
    ),
    true,
  )
  assert.equal(
    verify('sha256', Buffer.from(unsigned + 'tampered'), {
      key,
      dsaEncoding: 'ieee-p1363',
    }, signature),
    false,
  )
  const other = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  )
  assert.equal(
    await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      other.publicKey,
      signature,
      new TextEncoder().encode(unsigned),
    ),
    false,
  )
  assert.equal(claims.exp - claims.iat, 600)
  assert.equal(claims.role, 'authenticated')
  assert.equal(header.alg, 'ES256')
  assert.match(claims.sub, /^[0-9a-f-]{36}$/)
  assert.match(claims.sid, /^[0-9a-f-]{36}$/)
  // No JWT/private key is printed, persisted, imported or sent to any service.
})
