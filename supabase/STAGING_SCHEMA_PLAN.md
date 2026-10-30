# Minimum schema for an isolated Telegram auth + workout history test

**Design only. No SQL, tables, users, fixtures or cloud requests are created in
Stage 1.** This narrows the approved architecture into implementation gates; it
does not claim that its entire schema is already necessary for the first smoke
test. The first test is isolated staging with authorized test identities and
synthetic workout results, not real tester data or a connection from the live UI.

## 1. Four auth foundation tables

| Table | Minimum responsibility and constraints |
| --- | --- |
| `app.users` | Internal UUID PK, active/deleting status, created_at; no client-selected owner or role |
| `private.telegram_identities` | user UUID FK; positive bigint bot_id / telegram_user_id; unique `(bot_id,telegram_user_id)`; no name, phone, username, raw initData or bot token |
| `private.auth_sessions` | UUID session ID, user FK, refresh token hash, issued/absolute/idle expiry, revoked_at, rotation metadata; no plaintext refresh token |
| `private.init_data_redemptions` | Unique digest of validated launch data, auth_date, expiry; bounded replay handling; no raw Telegram user object |

Private tables are not exposed by Data API and have no `anon`/`authenticated`
read/write grants. Server access uses a reviewed least-privileged gateway role,
not browser credentials. Enable RLS and explicit role policies in the migration;
do not use table-owner/BYPASSRLS access for routine account operations.

No FK to `auth.users` is implied: the approved bridge has its own app UUIDs and
custom imported-key JWTs, not native Supabase Auth sessions. Signing and refresh
transport must be verified before these tables are implemented. Never substitute
the client-supplied Telegram ID for server signature validation.

## 2. Three history tables

| Table | Minimum responsibility and constraints |
| --- | --- |
| `app.workout_sessions` | Server UUID, user FK, client_session_id, payload hash, completed_at, received_at, recorded_sequence, exact new-plan/source metadata; unique `(user_id,client_session_id)`, `(user_id,id)` and owner/sequence |
| `app.session_exercises` | Distinct exercise-instance UUID, owner/session composite FK, ordinal, stable exercise ID and exact revision, optional subjective difficulty, frozen effective prescription; unique session/ordinal, not unique exercise ID |
| `app.session_sets` | Owner/exercise-instance composite FK, set_number > 0, nullable reps/weight_kg and observation state; unique instance/set_number, finite nonnegative values, no missing → zero conversion |

All three have active-session owner RLS and nested FK isolation. Completed rows
are immutable except a separately authorized deletion/correction workflow.
`completed_at` is reported client time; the server also records receipt time.
`recorded_sequence` preserves append order for Coach/progression, independent of
backdated dates. No fabricated 1RM, load aggregation or new progression formula.

For this one completion operation, `(user_id,client_session_id)` plus an immutable
payload hash is sufficient as the first idempotency record: same key/hash returns
the existing result; changed payload returns a conflict. A single transaction
writes session and all exercise/set rows. Competing requests must not partially
write children. Owner comes from the verified active JWT/session, never a body
field. Do not implement this as multiple browser inserts.

The audit's general `app.request_receipts` remains appropriate when additional
operations/import/draft protocol require it. It is not a prerequisite for this
single-operation test. Stage 1 implements neither approach.

## 3. Catalog keys required by the approved history FKs

The seven core auth/history tables above are the smallest user-data slice. To
retain the approved **relational** revision references, bootstrap these catalog
tables before the history migration:

- `catalog.releases` — source commit/schema version/checksum.
- `catalog.exercises` and `catalog.exercise_revisions` — stable existing slug ID
  and immutable revision key, unique `(exercise_id,version)`.
- `catalog.programs` and `catalog.program_revisions` — stable program ID and exact
  version key, including the current program's real version 1.
- `catalog.workout_templates` and `catalog.workout_template_revisions` — stable
  template ID and immutable revision key.

Thus this staged relational slice has **7 user/auth/history tables + 7 catalog
key tables = 14 tables**, not a full content database. A first auth-only test
can stop after its four foundation tables; it does not demonstrate workout
persistence. Full catalog metadata, candidates, movements/equipment joins and
curator/media workflows remain separate later migrations.

Bootstrap content must come deterministically from the reviewed bundled code:
45 existing exercises, one active Gym/3 program and three templates. Do not add
200 exercises, 70 programs, missing Home/Outdoor programs, or fake memberships.
Published revision keys are immutable and history FKs use `RESTRICT`; archive
content rather than deleting completed user results through a catalog cascade.
New template/exercise baseline revisions are explicitly tied to that release;
they do not retroactively prove versions of old local history.

For new staging sessions the transport must carry the actual selected
program/template/exercise revisions and original/effective plan evidence.
Cross-table validation or composite references must ensure the exercise revision
belongs to its supplied exercise ID and the template/program reference is
consistent. Do not infer source versions later from whichever catalog is current.

## 4. Deliberately outside this first test

- Profile/goal/inventory: not needed to prove auth and isolated result storage;
  required before connecting the existing onboarding/repository flow to cloud.
- Assignments and `user_progress_state`: not needed for the isolated completion
  test; required before changing the live resolver's count/assignment source.
  The existing independent local count must not be reconstructed from cloud row
  count. Full completion + counter will require one atomic transaction.
- Check-in, symptoms, adaptation reason/actions, legacy notes and consent tables:
  excluded from the first payload until the separate sensitive-data design and
  consent workflow exist. If `sessionContext` is submitted, reject it explicitly
  as unsupported; do not silently discard it or hide it in unrestricted JSON.
- Import batches/items, general receipts and migration reconciliation: required
  before importing any old local records, not before a synthetic auth smoke test.
- Durable draft/outbox/version-conflict protocol: required before wiring real UI
  writes; the isolated completion test alone does not prevent lost offline work.
- Weight, Nutrition, cycle, private Technique Review, subscription, Coach cache
  and full media catalog tables: not necessary for this slice; do not create them.

The existing live UI always supplies session context after check-in. Therefore
this restricted API must **not** be attached to App as a drop-in replacement:
full context/consent support, local durability, migration and domain-parity gates
are prerequisites for that later switch. Keep all current local data untouched.

## 5. Acceptance gates before broader integration

1. Server verifies valid/tampered/wrong-bot/expired/future/duplicate-key/replayed
   initData. A client-only user.id never authenticates. Confirm current official
   protocol and test vectors, and prove the selected imported signing key path.
2. With real staging user JWTs A/B, each can read only its own session and nested
   exercises/sets. Guessed UUID, supplied чужой user_id, foreign parent FK,
   direct DML/RPC and anonymous requests are denied. RLS remains enabled.
3. Logout/revoked/deleting account is denied even if its JWT has not expired.
   Private identity/session tables and refresh hashes are never client-readable.
4. Empty/partial set fields, explicit zero weight, repeated exercise instances,
   difficulty, sequence and exact frozen plan round trip without invention.
   Unsupported sensitive context is rejected, not dropped.
5. Repeat completion, two concurrent retries, and timeout after server commit
   produce exactly one session with all children. Reused ID with changed payload
   conflicts; no partial writes, no privileged fallback.
6. Current 285 tests, build and ESLint remain passing; no Program/Nutrition/Coach/
   Progress behavior changes. No live UI connection until draft/import/context
   gates are complete. Free staging must not be treated as production readiness.

This file is the review checklist for the next schema/auth implementation stage,
not authorization to run SQL or proof that any of these cloud tests already pass.
