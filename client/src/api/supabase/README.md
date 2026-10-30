# Supabase API boundary — reserved, not connected

Stage 1 reserves this directory for a future browser transport adapter. It
contains documentation only. There is no SDK import, client instance, startup
hook, environment read, auth state, network request, or local storage change.
Adding this directory does not alter the Vite entry graph.

## Dependency direction

```text
React UI
  → storage/repository facade
    → existing local storage implementation (current runtime)
    → api/supabase transport adapter (future, explicitly enabled)
  → existing pure domain helpers
```

`src/domain/` and core training types must not import the Supabase SDK or its
generated Database types. UI must not construct SQL rows or implement retries.
The existing three `src/storage/*Storage.ts` modules remain the active path.
Future repositories can coordinate local drafts/outbox and cloud acknowledgements
without making a JSX component choose a database table.

## Proposed future modules

| Module | Responsibility; not implemented in Stage 1 |
| --- | --- |
| `client.ts` | Explicit factory for one browser SDK client after public config and auth transport are validated; no module-level auto-connect |
| `authSession.ts` | In-memory access token from the verified Telegram gateway, refresh/logout boundary; no browser verification using a bot token |
| `workoutHistoryApi.ts` | Owner-scoped reads and atomic RPC calls; no direct multi-request session/set/counter writes |
| `workoutHistoryMapper.ts` | Runtime-validated cloud envelope ↔ existing `WorkoutSessionResult`, preserving missing values and append order |

Only add modules when they have a verified implementation; empty `.ts` files
and a fake successful adapter would imply functionality that does not exist.
Repository contracts belong above this transport, not in chart or training types.

## SDK integration review

`@supabase/supabase-js` is not currently a dependency. Its browser ESM client can
fit the current Vite / TypeScript stack without changing React, but installation,
version pinning and actual build validation belong to the next authorized
implementation stage. Stage 1 leaves `package.json` and the lockfile unchanged.

The approved architecture uses a custom Telegram gateway, not native Supabase
email login. A future factory must:

- Read **only** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
  Reject missing values, known placeholders, non-HTTPS URLs and a key that is not
  a publishable key. For this new project accept the `sb_publishable_` format;
  reject legacy JWT keys, `sb_secret_` keys and arbitrary secrets before creating
  a client. No silent fallback to a privileged key or another project.
- Supply the gateway's short-lived user JWT via the SDK `accessToken` callback.
  `sub` is the internal app UUID, not a raw Telegram ID. The publishable key
  grants no user identity. Never invent a token or bypass RLS when auth is absent.
- Keep token handling in the chosen gateway session transport. Do not let native
  Supabase Auth create a second persistent session: explicitly disable native
  `persistSession`, `autoRefreshToken` and `detectSessionInUrl` for this bridge.
  Do not call native `setSession` with a fake refresh token.
- Use user JWT + RLS for user reads/writes; no client `service_role`, secret API
  key, database password, imported signing private key or Telegram bot token.
- Expose explicit errors and remain inactive if auth/config is not ready.
  Cloud rollout must retain the current local path until migration acceptance.

The factory does not exist yet, so **these validation guarantees are next-stage
requirements, not implemented security checks**. Do not put real configuration
into production based on this README alone. All `VITE_*` values are public in
the bundle, even when their file is ignored by Git.

The server gateway belongs outside `client/src/`; its bot token, refresh-token
hashes and signing material must never cross this browser boundary. Server secrets
belong in a secret manager; session hashes belong in private server tables.

See [the approved architecture](../../../../BACKEND_ARCHITECTURE.md) and
[the minimal staging schema plan](../../../../supabase/STAGING_SCHEMA_PLAN.md).
