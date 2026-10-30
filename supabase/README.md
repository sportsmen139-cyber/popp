# Supabase staging foundations

Status: **Stage 2A source preparation; no cloud connection, deployment or DDL**.
The current Mini App, all domain calculations and the three localStorage keys
are unchanged. No local data has been read for upload, exported, or migrated.

## Stage 2A status

An isolated Deno HMAC validator, bounded fail-closed Edge handler, synthetic
security tests and local ES256 crypto PoC are now prepared under `functions/`.
Valid initData still receives 503: there is no session, JWT or account issuance.
Project key acceptance, live Telegram protocol review and SQL/session/role design
remain explicit deployment gates. See [AUTH_FOUNDATION.md](AUTH_FOUNDATION.md)
for source details, test commands, Secrets setup and the SQL review boundary.

The sections below record the Stage 1 baseline and its still-required next steps.

## Staging project record

The owner reported the following manually created project on 30 October 2026:

| Setting | Reported value |
| --- | --- |
| Organization | POPP Fitness |
| Project | popp-staging |
| Region | eu-central-1 |
| Plan | Free |
| Status | Healthy |

These are non-secret project labels, not a verified project connection.
Project ref/URL, publishable key, database credentials, Telegram credentials and
signing keys were not supplied or discovered. A project name is not its ref;
no hostname, credentials, cloud resources or users have been guessed or created.

## Stage 1 prepared files

- Root `.gitignore`: environment files throughout the repo, private key formats,
  common credential exports, local secret directories, Supabase CLI state and
  backup files. `.env.example` templates remain trackable. This protects future
  untracked files; it does not remove secrets already in history or inspect file
  contents. Templates must still contain placeholders only.
- [`client/.env.example`](../client/.env.example): exactly two public client
  settings, with an intentionally unusable `.invalid` URL and placeholder key.
- [`client/src/api/supabase/`](../client/src/api/supabase/README.md): reserved
  browser adapter boundary; no executable client or SDK dependency yet.
- [`migrations/`](migrations/README.md): versioned SQL convention and review gates;
  no executable SQL files, seeds or project config yet.
- [`STAGING_SCHEMA_PLAN.md`](STAGING_SCHEMA_PLAN.md): minimal auth/history slice,
  catalog FK bootstrap, deferred features and isolation acceptance tests.

The existing `client/.gitignore` remains in force. Root rules also protect future
server tools and nested directories. Do not use `git add -f` to include secrets.
`*.sql` is intentionally **not** ignored: reviewed schema migrations belong in
Git; database backups belong only in ignored/private storage.

## Environment boundary

Vite's working directory is `client/`. The future local configuration file is
`client/.env.local`, created from the template only when developer configuration
is actually needed. A repository-root `.env` is not automatically read by this
Vite configuration. No `.env.local` has been created in Stage 1.

| Value | Location and next-stage rule |
| --- | --- |
| `VITE_SUPABASE_URL` | Browser-visible project URL copied from the staging project's settings; no guess based on project name |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-visible publishable key from the same staging project; user isolation still requires validated JWT and RLS |
| Bot token, signing private key, server/database credentials | **Never** `VITE_*` or React source; authorized server secret manager only |
| User access token | Future gateway-controlled in-memory token, not an environment variable or Git artifact |

Only placeholders are committed. Do not add actual values to `.env.example`.
No `VITE_SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_SECRET_KEY` or browser bot-token
setting is supported. Filling an environment file alone must never activate an
unauthenticated cloud write path.

## What remains local and inactive

`App.tsx`, Training/Nutrition/Coach/Progress, `src/storage/`, core types,
`package.json`, lockfile and Vite entrypoints are unchanged. There are no imports
of Supabase, startup requests, migrations, RLS edits, auth mock, production flag
changes or real user fixtures. The presence of this directory does not initialize
the Supabase CLI. No `config.toml` with an invented project ref is included.

## Next-stage boundaries and required actions

1. Confirm the actual production domain/hosting and target Telegram clients.
   A same-origin auth proxy and cookie transport need a real device check;
   Telegram Web can restrict third-party cookies. No bot settings are changed here.
2. Confirm the auth implementation specified in the approved architecture:
   server `initData` verification → internal UUID → short-lived custom JWT,
   imported asymmetric signing key, private session/replay records and revocation.
   Supply bot credentials only through server secret management when that work is
   authorized. The official Telegram validation protocol/test vectors still need
   live verification; the prior audit recorded restricted access to that source.
3. Obtain the staging URL and **publishable** key from its dashboard for local
   developer configuration at the implementation stage. Keep them out of the
   template; never request or place server secrets in this chat or React code.
4. Review the first migration against the schema plan before any database change.
   Decide schema exposure, grants, gateway DB role and active-session RLS helper.
   Prove custom UUID `sub` → `auth.uid()` → Data API/RPC with two test identities;
   a failed auth path must not fall back to `service_role` or disabled RLS.
5. Install/pin the SDK and CLI only in their respective authorized implementation
   stages. Configure the approved runtime explicitly; do not run `link`, `db push`,
   remote SQL, a login exchange or deployment as part of this preparation stage.
6. The Free staging project is suitable for isolated development subject to its
   current quotas. It is not a production backup plan: the architecture's paid
   daily DB backup assumption is **not satisfied** by Free. Before actual tester
   data, choose encrypted off-site backups/restore testing or an approved paid
   plan, and approve privacy, consent, deletion and retention requirements.

None of these unavailable values blocks repository preparation. Auth code,
signing-key import, cloud credentials and schema execution stop at this boundary
until the corresponding implementation is authorized and inputs are available.
No dummy identity, password or token should be invented to move past it.

Reference: [BACKEND_ARCHITECTURE.md](../BACKEND_ARCHITECTURE.md). This Stage 1 record
adds the owner's staging project facts; it does not replace the architectural
requirements for user isolation, immutable history and migration without loss.
