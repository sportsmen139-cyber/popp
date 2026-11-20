# Smart Trainer — локальный аудит и preview

Полная библиотека: [локальный каталог 200 упражнений и сохранение решений](CONTENT_LIBRARY_REVIEW.md).
190 новых черновиков подготовлены; первые десять из пакета 0.3 сохранены без изменений.
В Git только инструменты и метаданные. Тексты приватны, назначений и публикации нет.

20 ноября 2026: [подготовка трёх программ на два дня](TWO_DAY_PROGRAMS.md),
запуск `Two Day Programs.command`; реальные назначения пока закрыты перечисленными
проверками. [Библиотека всех 200 упражнений](EXERCISE_LIBRARY_200.md) использует
существующий импорт. Первые десять новых текстов готовы приватно и ожидают проверки;
в публичный репозиторий их содержимое не включено.

**Текущий этап:** [авторская методика и изолированный пилотный Engine](PILOT_ENGINE.md).
Запуск на Mac — `Pilot Engine.command`, интерфейс `/pilot`. Одно заявление о ранее
выполненной содержательной проверке отделено от технической готовности. Основной
PRG_000002 использует 10 EX без необязательных ALT. Trainer Review остаётся
вспомогательным; повторное ручное утверждение 177 карточек не требуется.

Подтверждены реальный XLSX, 142 вкладки, 203 EX и 108 полных программ.
Аудит и импорт не активируют новый контент в приложении.

Stage 3: [локальный Trainer Review и запуск](PILOT_REVIEW_UI.md),
[вопросы тренеру по PRG_000002](PILOT_TRAINER_REVIEW.md),
[план Engine](PILOT_ENGINE_PLAN.md), [scope и блокеры](pilot/summary.json).
Ниже — история Stage 3/3B; новый процесс и фактические блокеры описаны выше.

Stage 3B: [простой запуск и инструкция владельцу Mac](MAC_TRAINER_REVIEW.md).
Двойной щелчок по `Trainer Review.command` открывает прежний локальный UI,
маршрут основных десяти и проверяемые резервные копии журнала. Snapshot при потере
восстанавливается только из оригинального XLSX с зарегистрированным SHA256.

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
