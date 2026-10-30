# Stage 2A — Telegram authentication foundation

Date: 30 October 2026. **Source and offline tests only. No deployment, schema
application, accounts, real credentials, client cloud calls or history migration.**

## Delivered source

| File under `supabase/functions/` | Purpose |
| --- | --- |
| `_shared/telegramInitData.ts` | Stateless Telegram Mini App HMAC verifier, strict decoding, time and identity checks |
| `_shared/telegramAuthHandler.ts` | Bounded POST/JSON request handling; deliberately cannot complete login |
| `telegram-auth/index.ts` | Deno Edge Function entrypoint; reads only the server bot-token secret |
| `tests/synthetic.ts` | Arbitrary synthetic key and independent Node HMAC signing oracle |
| `tests/telegramInitData_test.ts` | Real validator security tests, including an independent Python reference vector |
| `tests/telegramAuthHandler_test.ts` | Actual HTTP handler tests, streaming limits, non-disclosure and closed session boundary |
| `tests/es256_poc_test.ts` | Isolated ephemeral-key P-256/JOSE cryptographic interoperability proof |
| `deno.json` | Strict Deno type checks, tests, lint and format tasks; no external runtime packages |
| `.env.example` | Server-only placeholder; never a client configuration file |

Nothing imports this source from `client/`. The entrypoint's dependency graph
contains no tests, SDK, database client or JWT issuer. Client source, configuration,
dependencies, localStorage and all existing domain helpers remain unchanged.

## HMAC contract and hardening

The verifier accepts the **raw string value** of `Telegram.WebApp.initData`.
It does not accept `initDataUnsafe`, a standalone user ID, a decoded client object,
a Telegram Login Widget payload, or an Ed25519 signature as a substitute.

1. Limit the raw value to 8 KiB of UTF-8, then strictly decode form fields exactly
   once (`+` → space and percent decoding). Reject malformed UTF-8/percent escapes,
   empty/malformed key-value pairs, control characters and duplicate **decoded**
   keys, including encoded aliases such as `%68ash` + `hash`. ASCII field keys
   are bounded; unknown well-formed fields are included in verification.
2. Require a 64-hex-character `hash`, decode to 32 bytes. Exclude **only `hash`**,
   sort field names by ASCII order, join decoded `key=value` pairs with LF.
   No locale sort, JSON parsing/reserialization or extra URL decoding changes
   the values being signed.
3. Derive `secret = HMAC-SHA256(key=UTF8("WebAppData"), message=UTF8(botToken))`;
   verify `HMAC-SHA256(key=secret, message=UTF8(dataCheckString))` against hash.
   Use native `crypto.subtle.verify`, avoiding a JavaScript string comparison
   or an early-exit byte loop. Hash length/format checks happen first; no timing
   microbenchmark is claimed as a proof of cryptographic constant-time behavior.
4. After signature verification, require a positive integer `auth_date`.
   TTL is 300 seconds, future skew at most 30 seconds. Exactly 300 seconds old
   and exactly 30 seconds ahead are accepted; outside those bounds is denied.
   These are explicit engineering defaults, not Telegram-specified lifetime guarantees.
5. Parse `user` only after verifying its signed raw representation. Require an
   object with a positive safe-integer numeric ID; reject arrays, missing/unsafe
   IDs and bots. Preserve verified ID as a decimal string, including IDs above
   32 bits. Return no names, username, photo, phone or raw user object.

The verified result is **identity evidence, not an app session**. It contains
auth/expiry timestamps and `SHA256(verified HMAC bytes)` for a future canonical
redemption key. Reordered fields, alternate equivalent URL encodings and hash
hex case produce the same key. Hashing the raw URL instead would allow replay
tracking to be bypassed by a reordered URL.

The validator is intentionally stateless: it does **not** enforce one-time
redemption. A future database transaction must uniquely redeem the digest in bot
scope and bind a durable session atomically. No in-memory Set or process-local
cache is presented as replay protection for distributed Edge Functions.

### HMAC versus third-party Ed25519

The implemented path uses a **bot token** and HMAC. If Telegram supplies an extra
`signature` field, that field remains in this HMAC check string; it is not itself
validated as an Ed25519 signature. Changing it breaks HMAC verification.

Telegram's alternative third-party verification uses a Telegram public Ed25519
key, a bot-scoped `bot_id:WebAppData` prefix and different exclusions (`hash` and
`signature`) and signature encoding. That algorithm is **not implemented** here.
There is no automatic fallback from failed HMAC to Ed25519 or unsigned identity.
Tests explicitly distinguish the contracts, including wrong HMAC derivation order.

## HTTP boundary: validation is not working login

Prepared entrypoint: `telegram-auth/index.ts`, Deno/TypeScript, using Web APIs.
Input is POST `application/json` with **exactly** `{ "initData": "raw string" }`.
Extra identity fields and ID-only requests are rejected, not ignored.

- Request body cap: 16 KiB, measured while reading even without a truthful
  Content-Length. Invalid declared length is rejected; an oversized declaration
  is rejected before reading. Raw initData has its separate 8 KiB limit.
- Body deadline: 5 seconds; oversized/slow streams are cancelled without waiting
  for an attacker-controlled cancellation promise. Invalid UTF-8/JSON is denied.
- Missing/template/malformed server configuration fails closed. Invalid initData
  returns generic 401, not the detailed validator error, user ID or payload.
- Requests carrying Origin return 403; no CORS policy or cookie transport is
  guessed. Responses use `Cache-Control: no-store` and `nosniff`. There is no
  raw input/token logging; tests cover logging and response non-disclosure.
- Even a valid payload returns **503 `auth_session_not_implemented`**. No JWT,
  refresh token, cookie, database insert or authenticated session is created.

Do not wire this endpoint to the current Mini App. Deploying this foundation
alone would only expose a verifier that refuses login, not complete authentication.
Ingress rate limits, correct origin/cookie behavior, CSRF handling and atomic
redemption/session issuance must be reviewed before enabling a real login path.

## Tests and reproduction

Tested using Deno **2.9.6**. The tool was installed outside the checkout for this
verification; client `package.json` and lockfile are untouched. No network, env,
filesystem or subprocess permissions are granted to test code. Node built-in
assert/crypto imports are test-only; Edge runtime code uses standard Web Crypto.

From `supabase/functions/`, with Deno installed:

```sh
deno task check
deno task test
deno task lint
deno task fmt:check
```

The validator tests include every requested category: valid/modified/wrong/missing
hash, duplicate parameters, expiry/future date, malformed/missing user JSON,
oversize data, wrong bot token and user-ID-only attempts. Additional tests cover
canonicalization, signatures versus Ed25519-style input, malformed encoding,
unsafe IDs, request streaming, timeouts, secret-provider failure, non-disclosure
and the fact that this stateless validator cannot claim one-time redemption.

The HMAC oracle uses Node `createHmac`, not implementation helpers, and includes
a fixed reference calculated separately using Python `hmac`/`hashlib` with the
arbitrary test-only string key. Fixtures contain no Telegram bot-format token.
ES256 keys and UUID claims exist only in test memory; no private key or generated
JWT is printed, exported to the gateway, persisted or sent to Supabase.

Verification result for this source stage: **285 existing Vitest tests + 34 Deno
tests** (20 validator, 13 HTTP, 1 ES256 PoC) passed. Client `npm run build` and
`npm run lint`, Deno check/lint/fmt passed. All six frontend build files were
byte-identical to the pre-change build. Changed-file credential-pattern scanning
and review found only the declared synthetic key/expected hash and placeholders,
not real credentials or tester records. Cloud auth/RLS/SQL tests have not run.

## JWT feasibility: documented and local, not project-verified

Supabase's current official documentation source explicitly supports externally
minted JWTs via **imported signing keys**, including ES256/P-256, `kid`, user UUID
`sub`, `role=authenticated` and short `exp`. Browser API requests additionally
need a publishable API key; `accessToken` supplies the user JWT. A bot token or
publishable key is not itself a user's Supabase access token.

The isolated PoC checks that WebCrypto produces the 64-byte JOSE `r || s`
signature accepted independently by Node crypto and rejects changed content / a
different public key. Claims demonstrate a 600-second lifetime, synthetic issuer,
internal UUID and session UUID. It does **not** implement production JWT issuance,
claims verification, refresh/revocation, Supabase Auth login or RLS. Production
issuance/verification should use a maintained JWT library once runtime/key/claim
configuration is verified; do not turn the test encoder into an auth library.

**Not verified in `popp-staging`:** project ref/URL, key import availability on
its current plan, active key/`kid`, JWKS publication, custom app UUID support
through Data API, trusted issuer/audience enforcement, active-session RLS and
Edge runtime deployment. The project name/Healthy status cannot prove those facts;
no dashboard credentials/ref or project access were provided. No project API was
called, and no claims about its configured keys are made.

Next key gate: an authorized owner checks the actual staging project's signing
key settings, generates/retains a private ES256 key securely, imports/activates
the corresponding key according to the platform's documented lifecycle, verifies
its `kid` and JWKS, then runs the explicit Data API/RPC/RLS proof with isolated
test identities. If key import is unavailable on Free, resolve plan/provider
choice explicitly. Never use `service_role`, a legacy shared-secret workaround,
fake email users or disabled RLS to make an unverified path appear successful.

## SQL review boundary

**No SQL migration is created in Stage 2A. It is not ready for schema review.**
The four proposed tables remain the scope in `STAGING_SCHEMA_PLAN.md`:

| Table | Contract still requiring a concrete gateway/session transaction |
| --- | --- |
| `app.users` | Internal UUID, lifecycle and least-privileged account bootstrap authority |
| `private.telegram_identities` | Positive bigint bot/user identity, unique bot scope, owner FK |
| `private.auth_sessions` | Durable UUID, refresh hash/rotation/family, absolute/idle expiry, revocation and bound JWT sid |
| `private.init_data_redemptions` | Unique canonical digest/bot scope, expiry, atomic session creation and response-loss/retry semantics |

Blockers are the project-verified signing path, actual issuer/audience, Edge
gateway DB-role/connection contract, and refresh/cookie versus memory transport
with rotation/replay semantics. Guessing grants or an active-session helper now
would misrepresent an executable secure foundation. No partial always-true
helper, permissive bootstrap RPC or pseudo migration is supplied.

The next reviewed migration must create all personal tables with explicit RLS,
default-deny grants and constraints in the same transaction. `private` must not
be in exposed schemas, and must have no PUBLIC/anon/authenticated access. Server
roles must be least-privileged and non-owner/NOBYPASSRLS; routines must derive
identity from verified context. An active session check must include issuer,
audience, sid, expiry, revocation and account status. A direct schema exposure /
RLS check against the actual project is necessary; this source code does not
verify dashboard exposure settings. SQL tests have not run because no SQL exists.

## Secrets and next authorized staging work

For the prepared verifier, the only configured secret is **`TELEGRAM_BOT_TOKEN`**.
It is read on the server via `Deno.env.get` and never logged/returned. The template
`supabase/functions/.env.example` contains only a placeholder and does not work as
a real token. Local values, if authorized later, go in ignored
`supabase/functions/.env`, never under `client/` or into `VITE_*`.

For staging setup, an authorized Owner/Admin selects **popp-staging → Edge
Functions → Secrets** in the Supabase Dashboard and enters Key/Value there.
Double-check the project identity. Do not put actual values in chat, tracked
files, shell history, CLI arguments or CI output. A reviewed CLI workflow may use
an ignored env file/CI secret injection later; no CLI secret upload was run here.
Custom secret names must not start with the platform-reserved `SUPABASE_` prefix.

Later real session issuance will additionally need:

- Signing private JWK in Edge Function Secrets (proposed name
  `POPP_AUTH_SIGNING_JWK`), imported-key ID and verified issuer/audience config;
  none is read or invented by this foundation.
- Least-privileged gateway PostgreSQL/pooler credential in Edge Function Secrets
  (proposed name `POPP_AUTH_DB_URL`), after the DB-role design is reviewed.
- Refresh token **hashes in private DB records**, not an env file of user tokens.
  Client Supabase URL/publishable key are separate public configuration, not a
  substitute for these auth requirements.

Before a staging deployment: resolve the Telegram source-verification limit below;
confirm project/key path; approve schema/roles/session transport; implement and
test atomic redemption/session creation/refresh/revocation and active-session RLS;
set secrets securely; confirm exact allowed origins and rate limits. For an
initial external-credential login endpoint the platform's pre-handler JWT check
must be configured specifically to allow Telegram verification by the handler;
this is distinct from database RLS and must not disable RLS. No `config.toml`,
`verify_jwt` change, `link`, remote migration, secret upload, deployment or bot
setting change was made in this stage.

## Sources and verification limits

- [Telegram Mini App validation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
  direct access still returns proxy 403, including after network access was
  requested. The current live text could **not** be retrieved. The implementation
  follows the HMAC contract recorded in the approved architecture and the
  independently checked synthetic vectors; do not claim live official-protocol
  conformance or deploy until its current HMAC/Ed25519 details are independently
  confirmed against Telegram's official documentation. No community mirror has
  been represented as an official source.
- [Supabase JWTs](https://supabase.com/docs/guides/auth/jwts),
  [official source read](https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/auth/jwts.mdx).
- [Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys),
  [official source read](https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/auth/signing-keys.mdx).
- [Edge Function Secrets](https://supabase.com/docs/guides/functions/secrets),
  [official source read](https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/functions/secrets.mdx).
- [Edge auth modes](https://supabase.com/docs/guides/functions/auth),
  [official source read](https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/functions/auth.mdx).

Supabase references were retrieved from its official repository on the audit date.
Documentation support and a local crypto PoC are deliberately distinguished from
actual project acceptance and a complete login implementation.
