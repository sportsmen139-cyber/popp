# Smart Trainer — локальный аудит и preview

Подтверждены реальный XLSX, 142 вкладки, 203 EX и 108 полных программ.
Аудит и импорт не активируют новый контент в приложении.

- [Полный аудит](IMPORT_AUDIT.md) — факты, статусы, версии, конкретные конфликты.
- [Schema mapping](SCHEMA_MAPPING.md) — все исходные поля и правила сохранения.
- [Legacy mapping 45 IDs](LEGACY_EXERCISE_MAPPING.csv) — сравнение с evidence, без aliases.
- [Blockers](IMPORT_BLOCKERS.md) — trainer/content/engine/rights/media boundaries.
- [Матрица всех программ](audit/program-compatibility.csv) и [coverage](audit/coverage.csv).
- [Used ranges 142 листов](audit/sheet-index.csv), [diagnostics](audit/diagnostics.json), [summary](audit/summary.json).
- [Receipt](audit/snapshot-receipt.json), [real-data verification](audit/verification.json), [browser](audit/preview-browser.json).
- [Importer и команды](../../tools/smart_trainer/README.md).

Полный preview и исходный workbook остаются ignored/local до подтверждения прав.
Main, production, Supabase, история и существующий Training Engine не менялись.
[Recovery status](RECOVERY_STATUS.md) — исторический checkpoint предыдущего этапа;
его прежний источник BLOCKED_SOURCE закрыт получением настоящего XLSX.
