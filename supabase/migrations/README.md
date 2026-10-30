# Versioned SQL migrations — reserved

This directory intentionally contains **no `.sql` files yet**. Stage 1 does not
define, apply or seed a database. A no-op SQL file would create a misleading
migration version; an unfinished schema would cross the auth/RLS review boundary.

Stage 2A also stops before executable SQL: actual project key acceptance, gateway
DB role, issuer/session helper and refresh/replay transaction remain unresolved.
The HMAC source/tests do not settle those privileges. See the explicit
[auth foundation review boundary](../AUTH_FOUNDATION.md#sql-review-boundary).

## Naming and workflow for the implementation stage

- One reviewed change per `<YYYYMMDDHHMMSS>_<snake_case_description>.sql`.
  The 14-digit version is a unique UTC creation timestamp, strictly increasing;
  do not invent/apply a version just to populate this directory.
- Supabase CLI can generate the version when implementation is authorized.
  Commit the SQL and its migration/policy tests together. `README.md` is not
  an executable migration and is ignored by the migration runner.
- Published/applied migrations are immutable. Corrections are new migrations;
  no editing remote history, unreviewed `migration repair`, or dashboard-only
  schema that cannot be reproduced from Git.
- SQL contains schema, constraints, functions, grants, RLS and non-personal
  canonical content only. No bot tokens, API/database credentials, auth payloads,
  real test users, dumps, private media, or arbitrary production records.
- Each new personal table is created with RLS enabled and restrictive grants in
  the **same transaction**. Default deny until reviewed policies exist. `private`
  is never an exposed Data API schema; no broad `GRANT ALL`, RLS disabling, or
  privileged user-data RPC to get around an unfinished auth implementation.
- `*.sql` must remain trackable. CLI caches and `supabase/backups/` are ignored;
  they must not be confused with reviewed migration SQL.

## Proposed sequence, not generated files

1. **Auth foundations:** app user IDs; private Telegram identity, session and
   redemption tables; least-privileged gateway role; active-session helper;
   owner policies and grants. Depends on the approved JWT/gateway implementation.
2. **Catalog key bootstrap:** only the identities and immutable revision keys of
   the real bundled exercises/program/templates, pinned to a source release.
   No new content and no activation of unsupported programs.
3. **History vertical slice:** sessions, exercise instances, sets, atomic
   idempotent finalize/read RPCs and nested owner constraints. No sensitive
   check-in payload accepted until its consent/schema phase exists.
4. **Later separate migrations:** profile/goal/inventory, assignment/counter,
   wellbeing consent/context, migration receipts/outbox protocol, full catalog
   and media. Create them only as their real implementation reaches review.

See [the minimal schema plan](../STAGING_SCHEMA_PLAN.md) for the distinction
between an isolated staging smoke test and a complete cloud migration.

## Required verification before any remote application

Recreate the schema on an isolated local/test DB from all migrations; run
constraints, rollback/recovery checks and SQL RLS tests (future location
`supabase/tests/database/`). Also test HTTP Data API and RPC with two genuine
staging user sessions and an anonymous request; admin-client success is not an
isolation test. Test failures must leave RLS enabled and the app on its local path.

Before applying to any remote project, confirm its exact ref/environment and
backup/restore procedure. Stage 1 has neither installed the CLI nor linked a
project, and has executed no database command. Production application and local
history are not switched by publishing this directory to GitHub.
