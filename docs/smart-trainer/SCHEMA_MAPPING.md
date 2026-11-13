# Контракт будущего импорта и совместимости

Это **проект mapping**, не утверждение о колонках непрочитанной Google-книги и не
SQL-миграция. Точные названия/типы колонок заполняются только по snapshot.
Training Engine и его источники сейчас остаются прежними.

## Путь данных

```text
read-only workbook snapshot (version, SHA256, source rows, formulas + cached values)
  → source-specific schema validation (после аудита колонок)
  → normalized immutable content + row diagnostics
  → внутренний preview с исходными статусами
  → явный trainer approval + publication release
  → typed catalog adapter после проверки engine capabilities
```

Google Sheets не участвует в runtime. Импорт одного и того же snapshot/schema
version должен давать те же ключи, порядок, counts и output hash. Ключи:
`(exercise_id,version)`, `(program_id,program_version)`, полные source session/slot
keys из книги. Изменённое содержимое под уже импортированной версией — конфликт,
а не last-write-wins. Approval — отдельная запись review; повторный импорт не
переписывает решения. Новый snapshot не является автоматической публикацией.

## Сохранение полей

Колонка Source sheet ниже обозначает ожидаемую область **по заданию**, а не
подтверждённую схему. Все исходные поля сохраняются losslessly в raw snapshot.
Неизвестные tokens остаются диагностикой, никогда default-approved/default-empty.

| Source data | Ожидаемая область | Normalized contract / ограничение |
| --- | --- | --- |
| exercise_id, version, name_ru, name_en | 12 | Stable identity + immutable revision; разные версии не склеивать |
| concept_id, family_id, primary_pattern, exercise_type | 03/04/11/12 | Controlled FK с source vocabulary; не приводить автоматически к legacy pattern |
| minimum_level, prerequisites | 12/14 | Source level + directed prerequisite edges; проверить self/dependency cycles |
| location membership | 12/14 | Explicit environment relation; пустое не значит все среды |
| equipment combinations | 11/12/14 | EquipmentOption[] OR; items[] AND; unknown отдельный статус |
| load_type, assistance_mode, measurement_unit | 11/12 | Controlled fields; «кг помощи», «кг суммарно», «кг на гантель» не эквивалентны |
| setup, execution_standard, common_errors | 12/13 | Source strings/list structure, без автогенерации инструкций |
| progression_options, regression_options, limitations | 12/13 | Preserve options/constraints; текст не становится исполняемой формулой |
| biomechanics | 13/14 | Explicit variant traits, sources; prerequisite для identity mapping |
| muscle relations | 14 | PRIMARY / SECONDARY / STABILIZER, не EMG и не количественная активация |
| evidence references, review_status, trainer_comment | 20–22 + linked rows | References + исходный review token; комментарий не approval |
| program_id, program_version, environment, goal, level, equipment | 16 | Full program identity/revision + explicit requirements |
| days_per_week, duration, phases, weeks | 16/17 | Preserve cycle hierarchy; 8 недель нельзя заменить бесконечной одной неделей |
| session_id, slot_id, exercise/order | 17/18 | Уникальный slot instance внутри точной версии/недели/сессии; не exerciseId как ID слота |
| sets/reps/time/distance/RIR/rest | 18 | Tagged prescriptions + units; не перегружать поле reps временем/метрами |
| miss/fatigue/adaptation rules | 09/10/16–18 | Версионированные правила и допустимые ограничения; unsupported → preview only |
| weekly volume | 19 | Source declared + independent validated calculation, provenance обоих |
| substitutes | 05/15 | Directed edge, category A/B/C, context/dose rules, source review state |

## Legacy mapping layer

Текущий draft: [LEGACY_EXERCISE_MAPPING.csv](LEGACY_EXERCISE_MAPPING.csv).
Поля: `legacy_exercise_id → new_exercise_id + new_exercise_version → match_type →
confidence → decision → evidence`. 45 строк в состоянии `PENDING_SOURCE`.

После аудита допустимы EXACT, SAME_EXERCISE_DIFFERENT_NAME, DIFFERENT_VARIANT,
AMBIGUOUS, NO_MATCH. Confidence означает степень подтверждения reviewer'ом,
не вычисленную вероятность по строковому сходству. У каждого решения нужны
source sheet/row/version + сравнение grip, machine, laterality, bench angle,
bodyweight/assistance, barbell/dumbbell, ROM и resistance.

История продолжает хранить исходный legacy ID; aliases не переписывают записи,
веса и reps. Даже EXACT не разрешает автоматически переносить кг между
разными единицами или equipment contexts. DIFFERENT_VARIANT/AMBIGUOUS/NO_MATCH
никогда не объединяют историю и не выбираются как identity alias.
Нужна замороженная legacy name resolver layer для чтения старой истории после
будущего расширения; сейчас её роль продолжает выполнять неизменный массив 45
упражнений. Никакой новый alias не подключён к UI/Progress/Load Engine.

## Состояния контента

`imported` — прочитано, но не проверено; `validated` — структура/FK проверены;
`trainer_approved` — есть явное содержательное решение;
`published` — точная revision включена в отдельный опубликованный release.
Это отдельные gates, а не автоматическая цепочка повышений статуса.
Исходные NEEDS_REVIEW/REJECTED сохраняются; их нельзя выдавать автоматическому
resolver или механически превращать в APPROVED. Importer не выполняется,
новых записей в рабочем каталоге нет.

## Coverage matrix

Пока источник недоступен, реальную матрицу 108 программ составить нельзя.
Для каждой будущей строки нужны source program ID/version, Environment × Level ×
Days per Week × Goal, phase/week completeness и список unsupported capabilities.
Заявленные 64/28/16 не доказывают покрытие конкретных combinations.

| Кодовая база сейчас | Level | Frequency | Goal / факт поддержки |
| --- | --- | --- | --- |
| Gym, `gym-fullbody-3` v1, A/B/C | beginner/intermediate/advanced | 3 | general_fitness → balanced; hypertrophy/glutes → glutes; exercise_performance/pull_up → pullups |
| Gym | те же | 2/4 | Нет подходящей программы; интерфейс сохраняет явное unavailable state |
| Home / Outdoor | те же | 2/3/4 | Нет активной программы в текущем resolver |
| Любая среда | любой | 1 | Onboarding и BaseProgram union 2/3/4 не поддерживают 1; не менять молча |
| Программы из Google Sheets | Не проверено | Не проверено | Ни одна ещё не признана совместимой |

Текущий код умеет выбирать A/B/C по счётчику завершений, адаптировать одну
сессию по check-in и предлагать прежнюю локальную progression по reps/weight/
difficulty. Это не cycle scheduler и не исполнение правил новой таблицы.
`ExerciseTarget` знает time/distance, но logger/Load Engine не доказывают их
полную поддержку; наличие union member недостаточно для подключения программы.

Отдельный следующий engine этап: фазовый calendar/cycle state, week/session
assignment, пропуски и переходы/повторы, modality-specific result types/units,
RIR, program-specific progression, fatigue rules и adaptation limits. Каждое
расширение требует regression fixtures и решения о миграции назначения программы.
Старый Gym/3 resolver сохранять до полного regression review.

## Направленные замены

A (CLOSE) не переносит кг автоматически. B (GOOD) требует контекст/equipment/
level/dose review. C (PARTIAL) — согласованное изменение программы. X→Y не даёт
Y→X; X→Y и Y→Z не дают X→Z. Каждое ребро имеет собственную версию, причину,
ограничения и approval. NEEDS_REVIEW/REJECTED связи отключены. Цикл разрешённых
явных встречных ребер не равнозначен циклу prerequisites; аудит различает их.

## Обязательные проверки: честное состояние

| Требование | Сейчас |
| --- | --- |
| 45 IDs, прежний resolver, equipment/environments | Зафиксированы существующими catalog migration regression tests |
| Старые Workout/Session/Load/Progression/Progress | Исходники и тесты не менялись; unit suite + browser storage fixture regression |
| Дубли новых упражнений / названия | BLOCKED_SOURCE; отсутствие новых строк не является проверкой 200 записей |
| NEEDS_REVIEW/REJECTED не публикуются | Из Sheets ничего не импортировано; видео gate отдельно покрыт тестами; будущий importer ещё требует tests |
| Ссылочная целостность 200/108 | BLOCKED_SOURCE; нет ложного passing/skipped теста на придуманных данных |
| Program coverage / substitutions | BLOCKED_SOURCE + будущий engine review |

Каталог, programs, taxonomy и history не перезаписываются. Источник остаётся
нужным условием завершения этапов 1–5, а не формальностью после написания кода.
