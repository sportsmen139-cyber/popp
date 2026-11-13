# Умный тренер: аудит реального XLSX

Дата аудита: **2026-11-13**. Ветка `feature/smart-trainer-catalog-alpha`, база `abcf578`.
Исходник открыт read-only; приложение, main, production, Supabase и история не менялись.

## Источник и происхождение

Получен настоящий файл «Умный тренер — архитектура базы и шаблоны проверки.xlsx»:
**5 083 138 bytes**, **142 вкладки 00–141**, все visible. SHA256:
`1919449150c40600c12d719b415ba1792ac331a8d29be2e4c6191f36f18a904a`.
Spreadsheet ID: `1RbkoiW_6cq4UbojCPBrYmNRmt_sOEA8VMHGpDxoas-0`.
Google не использовался вместо приложенного файла.

В A2 листа 00 есть document label «Архитектура v1.0 · 26.10.2026 · Этап согласования».
Это дата архитектурной надписи, **не подтверждённая дата экспорта XLSX**.
Достоверной export timestamp в package нет; `exported_at=null`. Дата этого аудита
не подменяет дату snapshot. Receipt: [snapshot-receipt.json](audit/snapshot-receipt.json).

Прочитаны все 142 листа. [sheet-index.csv](audit/sheet-index.csv) фиксирует реальные
занятые диапазоны, first/last row/column, populated/stored cells, merges и формулы.
Метаданные dimension у экспорта неполны, поэтому ranges определены по ячейкам.
Сохранены 626 587 ячеек, включая пустые оформленные ячейки, и 103 552 формулы.
Исходные formula strings/attributes, cached values и expanded shared formulas
хранятся раздельно. Workbook не пересохранялся и не вычислялся как Excel.

## Количества, ключи и статусы

| Нормализованный лист | Фактические строки | NEEDS_REVIEW | REJECTED |
| --- | ---: | ---: | ---: |
| 12 Упражнения | 203 | 200 | 3 |
| 13 Биомеханика | 203 | 200 | 3 |
| 14 Связи | 8 634 | 8 596 | 38 |
| 15 Замены | 540 | 528 | 12 |
| 16 Программы | 108 | 108 | 0 |
| 17 Сессии | 966 | 966 | 0 |
| 18 Состав сессий | 5 148 | 5 148 | 0 |
| 19 Недельный объём | 9 009 | 9 009 | 0 |
| 20 Проверка | 7 289 | 7 274 | 15 |

Итого 32 100 исходных строк этих девяти таблиц. Ни одна не отфильтрована при
импорте, включая REJECTED. Публикация отключена; «200 действующих» означает
неисключённые записи, а не APPROVED. У упражнений и программ все версии = 1.
Дублей primary IDs/текущих revisions, невалидных IDs, потерянных typed FK,
неверных referenced versions, missing required fields и неизвестных enum tokens
по зарегистрированной schema v1 не найдено. Биомеханика покрывает все 203 revisions.

Отдельные определения: **54 concepts, 54 patterns, 165 families, 44 muscles,
72 equipment**. В 21 источнике 119 строк provenance: 118 EVD IDs и явный внутренний
маркер PROJECT; PROJECT не является ошибочным PMID или потерянным ID.
Ключи/ссылки проверены, научные статьи не проходили отдельную внешнюю экспертизу.

Отклонённые упражнения сохранены как архив:

- `EX_000072`, лист 12 строка 76;
- `EX_000095`, лист 12 строка 99;
- `EX_000098`, лист 12 строка 102.

Активных программных позиций с этими IDs нет. Связанные отклонённые relations,
alternatives и review records также сохранены без повышения статуса.

## Программы и циклы

Подтверждены **64 GYM / 28 HOME / 16 OUTDOOR**, уровни **27 BEGINNER /
61 INTERMEDIATE / 20 ADVANCED**. Частота: **4 × 1 день, 31 × 2, 36 × 3, 37 × 4**.
107 программ по 8 недель; `PRG_000006` (лист 16 строка 10) — 6 недель.
Во всех 108 программах по три фазы, всего **324 scoped phases**.
Проверены покрытие недель без разрывов/перекрытий, согласованность phase intervals,
число дней каждой фазы, cycle_day в пределах семидневного цикла и порядок slots.
Cycle days являются днями календарного цикла (например 1/3/5), а не индексами 1/2/3.

Основной источник — 16–19. Визуальные листы 34–141 использованы только для контроля:
108 unique program IDs и ровно 5 148 отображаемых slots совпали с нормализованными.
В ранних карточках есть VLOOKUP, в поздних — прямые cell references; оба вида учтены.
Лист 33 содержит те же 108 программ. Обзоры не создают повторные сущности.

Ни один цикл не превращён в статичную неделю. Duration, phases, weeks, sessions,
ordered slots, sets, reps/time/distance, RIR, rest, minimum sets, cut rank,
progression/missed/fatigue/adaptation rules сохранены в private preview.

## Конкретные несогласованности и диагностические различия

Полный машиночитаемый список групп/числа случаев/примеров строк:
[diagnostics.json](audit/diagnostics.json). Это результаты проверок, не изменения source.

### 1. Единицы назначения: 312 позиций в 90 программах

В 18 заданы `time_seconds`, хотя у соответствующего EX в 12 `measurement_unit=REPS`:

| EX | Количество позиций | Пример первой проблемной строки |
| --- | ---: | --- |
| EX_000135 | 243 | `SLOT_000558`, лист 18 строка 562 |
| EX_000139 | 36 | см. diagnostics / полный private audit |
| EX_000145 | 21 | см. diagnostics / полный private audit |
| EX_000144 | 12 | см. diagnostics / полный private audit |

Это конфликт контрактов, не основание автоматически изменить упражнение, секунды
или repetitions. Тренеру нужно решить, поддерживается ли отдельное timed исполнение,
нужна ли другая revision/карточка или исправление slot. Importer сохраняет оба значения.
Всего timed slots 468 в 93 программах. Карточек REPS/SECONDS/METERS = 189/11/3;
реальных distance slots в программах **0**, поддержка METERS не имитируется.

### 2. Home overview неполон относительно membership

В `31_Дом_обзор` 98 IDs, но 104 неисключённых HOME memberships из листа 14.
В overview отсутствуют `EX_000001`, `EX_000002`, `EX_000003`, `EX_000182`,
`EX_000189`, `EX_000196`. Это расхождение представления/классификации, не потеря
при импорте. Условия конкретного домашнего оборудования требуют review.
Outdoor overview: 89 IDs, совпадает с 89 неисключёнными memberships.

### 3. Оборудование: 34 карточки без явного required kit

В 14 нет EQUIPMENT_REQUIRED для 34 карточек, например `EX_000023` (12:27).
Часть по описанию выполняется на полу без инвентаря, но источник не даёт отдельного
машиночитаемого equipment-free marker. Импорт сохраняет `state=unknown`, не []
и не unlimited inventory. Для остальных комплектов сохранены OR групп KIT и AND
предметов внутри группы. Optional items не превращены в обязательные.
У всех программ есть declared KIT_01; для EX с явными requirements проверка
достаточности комплектов, environment membership и FK не выявила разрывов.
Для unknown requirements достаточность оборудования не подтверждена.
72 source equipment capabilities не приравниваются автоматически к 26 legacy IDs.

### 4. Недельный учёт требует контекста, а не автоматической «починки»

11 343 суммирующие формулы F/G/J сверены с точными sets по IDs листа 18: cached
values совпали. Независимая модель по общим `volume_role` обнаружила **915 отличий
полей** (180 direct, 246 indirect, 489 practice) и **45 отличий frequency**.
Это engineering review: source использует дополнительную контекстную классификацию
«контроль корпуса/удержания/негативы → практика», которой нет как отдельного typed override.

Пример `VOL_000998` (19:1002, PRG_000013/PHASE_01/MUS_000038): source practice=4,
direct=0; общие роли дают practice=2, direct=2, поскольку `SLOT_000564` использует
динамическое `EX_000131`. Пример `VOL_008155` (19:8159): source frequency=2,
модель, включающая primary stabilization practice, даёт 3 из-за `SLOT_004616`.
Эти сравнения **не доказывают физиологическую ошибку** и не калибруют модель.
Нужны явные approved accounting overrides либо согласованная единая спецификация.

Все 1 233 muscle relations имеют `volume_coefficient=null`; все 9 009 modelled_sets
тоже unknown. Никакие 0,5, нули или EMG-проценты не назначены автоматически.
PRIMARY/SECONDARY/STABILIZER остаются анатомическими ролями, не измеренной активацией.

### 5. Проверка формул: подозрение на диапазон 1000 не подтвердилось

Проверены 113 106 exact VLOOKUP calls: все текущие keys существуют в фактических
границах их ranges. Поздние формулы расширены до 5152/9013; малые ранние ranges
используются для ранних ключей. Текущих out-of-range lookup keys и cached Excel
errors не найдено. Регрессия ловит будущий выход ключа за range.
10 188 empty caches сохранены как unknown/blank, не zero. Shared formulas
восстановлены с учётом относительных ссылок, $, quoted strings и sheet names;
все 103 552 expressions совпали с независимым openpyxl.

Лист 07 содержит план 150/60/30 и старую метку «НЕ СОЗДАНЫ» (строка 14).
Это устаревшая сводка/план, не фактическое отсутствие 203/108 записей. Плановые
environment counts нельзя складывать как число уникальных упражнений.
У листа 01 дублируются подписи review_status/trainer_comment в F:G и H:I;
raw-представление хранит их по координатам, а не перезаписывает одинаковыми ключами.

## Legacy mapping и замены

[LEGACY_EXERCISE_MAPPING.csv](LEGACY_EXERCISE_MAPPING.csv): все 45 legacy IDs,
source SHA256, кандидаты, source rows 12/13, тип, confidence, решение и evidence.
**1 EXACT, 5 SAME_EXERCISE_DIFFERENT_NAME, 28 AMBIGUOUS, 5 DIFFERENT_VARIANT, 6 NO_MATCH**.
Например RDL нельзя склеить с одним EX: source разделяет штангу EX_000101 и
гантели EX_000102, а legacy допускает OR. Goblet squat с гирей отличается от
source EX_000081 с гантелью. Pec deck/тяги/жим ногами требуют уточнить устройство,
хват, поддержку или угол. Все решения `KEEP_LEGACY_NO_HISTORY_MERGE`.
Это инженерное сопоставление по доступной специфике, не утверждение тренера.

В 15 **4 A / 413 B / 123 C**; 528 NEEDS_REVIEW, 12 REJECTED. Во всех 540
load_history_policy=RECALIBRATE. Проверены обе revisions, directed endpoints и
1 734 SLOT_ALTERNATIVE links с исходным EX и ролью позиции. Обратных и транзитивных
рёбер не создаётся. Цикл встречных альтернатив сам по себе допустим; иерархии
prerequisites не строятся из свободного текста как будто это typed graph.
A не разрешает перенос кг; B требует контекст/dose review; C — изменение программы.
Автоматически активированных EX, программ или связей **0**.

## Совместимость и результат импорта

[program-compatibility.csv](audit/program-compatibility.csv) — все 108 revisions с
конкретными blockers. [coverage.csv](audit/coverage.csv) — 216 combinations
Environment × Level × Frequency × Goal, включая нулевое покрытие.
Полностью совместимых циклов для автоматического подключения сейчас **0**.
Нужны phase/week scheduler, source-specific progression/fatigue/miss/adaptation,
RIR, versioned assignments/history и equipment mapping. Дополнительно 4 программы
на 1 день, 44 Home/Outdoor, 93 с timed slots, 16 с отсутствующим типом split,
18 с отсутствующим типом goal. Наличие time/distance в union не равно result logging.
Рабочий старый Gym/3 resolver сохранён без изменений.

Importer `tools/smart_trainer` создал только ignored `.local/smart-trainer/<sha>/schema-1-importer-1.0.0`:
original bytes, raw-cells JSON.gz, normalized catalog, audit, manifest и HTML preview.
Каждая таблица/поле/status сверены; ни одна canonical entity не взята из обзорных
листов. Повтор идентичен; changed existing snapshot отвергается без overwrite.
Реальный preview проверен в браузере; 203/108 выбираются, три фазы видны, REJECTED
видим как REJECTED, внешний трафик отсутствует, layout 320/390/1280px корректен.

Проверки: 36 новых Python tests; 319 существующих client tests; build/ESLint;
15 проверок реального snapshot, включая независимое сравнение 626 587 values и
103 552 formulas; 5 browser preview checks. Отчёты: [verification](audit/verification.json),
[browser](audit/preview-browser.json). Автоматический структурный аудит не заменяет
trainer approval. Оригинал и полные авторские тексты не публикуются: права на
распространение не установлены. См. [блокеры](IMPORT_BLOCKERS.md).
