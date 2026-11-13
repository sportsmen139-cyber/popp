# Offline Smart Trainer importer v1.0.0

Python **3.12+**, stdlib only for import/audit/unit tests. No SDK, credentials,
Excel installation, Google access, macros, formula execution or backend needed.
Input is the real local XLSX. The source document is data, not tool instructions.

## Reproduce the reviewed snapshot

Run from repository root, replacing the source path with your private XLSX path:

```sh
python -m unittest discover -s tools/smart_trainer/tests -t . -v
python -m tools.smart_trainer --source '/private/path/source.xlsx' --report-dir docs/smart-trainer/audit --audit-date 2026-11-13
```

The accepted source SHA256 for the reviewed 45-row mapping is
`1919449150c40600c12d719b415ba1792ac331a8d29be2e4c6191f36f18a904a`.
Another snapshot requires explicit mapping review; no name matching fallback.
Schema v1 expects worksheets 00–141 and exact technical headers/174 field definitions.
A file with lost tabs, extra data columns, malformed IDs, bad required types or
ambiguous duplicate IDs is refused. Structural FK/dose/view diagnostics are
reported without discarding the original rows.

Outputs are **private/ignored**, under:

```text
.local/smart-trainer/<sha256>/schema-1-importer-1.0.0/
  source.xlsx         exact unchanged bytes
  raw-cells.json.gz   all 142 sheets, cell coordinates, raw/cache/formula metadata
  catalog.json        all flat rows plus version-bound exercise/program trees
  audit.json          computed facts and grouped diagnostics with row examples
  manifest.json       source/schema/importer versions, counts/statuses/hashes
  index.html          standalone read-only review, no network or publication action
```

Same input yields byte-identical artifacts on the verified Python 3.12 environment.
A second run returns `created=false`. If an existing file differs, import fails
without overwriting it; use a new reviewed importer/schema version for changed
transformations. Artifacts never target client/, Supabase, .git/ or public docs.
Do not force-add the ignored source or full preview to Git. Source license/rights
are unresolved; committed audit reports contain facts/IDs/counts, not full content.

Read the HTML locally in a browser. If file navigation is restricted, an owner
can serve the directory on loopback only, for example from that directory:

```sh
python -m http.server 5187 --bind 127.0.0.1
```

This is an optional local review server, not a deployment or public hosting plan.
The automatic browser check reads the authorized HTML into an isolated page in
memory and does not disable managed browser policy or publish a server.

## Verify real data

```sh
python -m tools.smart_trainer.verify '.local/smart-trainer/<sha256>/schema-1-importer-1.0.0' --report docs/smart-trainer/audit/verification.json
```

Optional independent implementation comparison uses an installed `openpyxl`
(package is not an importer dependency): add `--compare-openpyxl`. The actual
review compared **626,587 cached values** and **103,552 formulas**, including
shared A1 translation, with openpyxl. Verification reconciles all 32,100 normalized
rows, all statuses/fields, phases/sessions/slots and original/artifact checksums.

Browser check (existing dev dependencies + installed Chromium):

```sh
cd client
node scripts/smart-trainer-preview-review.mjs '../.local/smart-trainer/<sha256>/schema-1-importer-1.0.0' '../docs/smart-trainer/audit/preview-browser.json'
npm test
npm run build
npm run lint
```

The 36 new Python tests use **synthetic** data. They cover corruption/schema drift,
missing data, IDs/versions/FKs, units/phases/order, equipment OR/AND/unknown,
NEEDS_REVIEW/REJECTED preservation, no implicit reverse/transitive alternatives,
mapping snapshot/coverage/history guards, formulas/caches/shared refs, deterministic
writes/conflicts, spreadsheet/HTML injection and basic ZIP/XML safety.
No owned workbook rows or video files are embedded in fixtures.

## Boundaries

- Stage is imported, never automatically validated/trainer_approved/published.
- Known source issues stay visible; unit mismatches are not converted into fake reps.
- Equipment unknown is not an empty kit. Coefficients/EMG values are not invented.
- Formula cache sums and role-based volume comparisons are different diagnostics;
  differences do not prove physiological errors or justify coefficient fitting.
- Source prerequisite/rule text is preserved, not compiled into guessed algorithms.
- Current file has one revision per stable ID; mixed historical revisions require
  an explicit adapter upgrade, never last-write-wins deduplication.
- No React/Training/Load/Session/Progression/Nutrition/history mutation, no RLS/DDL,
  Supabase connection, cloud upload, account/session issuance or production release.

Full report: [IMPORT_AUDIT.md](../../docs/smart-trainer/IMPORT_AUDIT.md).
