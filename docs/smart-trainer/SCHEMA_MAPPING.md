# Подтверждённая schema и изолированный catalog adapter

Проверено по реальному snapshot SHA256
`1919449150c40600c12d719b415ba1792ac331a8d29be2e4c6191f36f18a904a`.
Полная техническая schema: [tools/smart_trainer/schema.json](../../tools/smart_trainer/schema.json).
Она фиксирует порядок 174 полей девяти таблиц, типы, required/conditional и enums,
сверенные с 02/03/08/11. Изменение заголовков/лишние data columns не принимается
как прежняя schema. Mutable field dictionary из нового XLSX не отменяет проверки.

## Pipeline и сохранение

```text
original XLSX bytes + SHA256, read-only
 → OOXML cells (all 142 sheets; raw values + formulas + caches + shared expansion)
 → strict source schema and FK/versions audit
 → normalized flat tables (32 100 rows, source sheet/row, status unchanged)
 → version-bound exercise/program preview tree
 → ignored local HTML/JSON, stage=imported, publication=disabled
```

Импорт не использует Google в runtime и не импортируется React или Engine.
Original bytes сохраняются рядом с полными private artifacts и hash каждого
файла в manifest. Flat rows не дедуплицируются по names или aliases. Ошибочные
header/IDs/types отказывают в импорте; содержательные конфликты остаются в audit
и preview без автоматической «починки». Existing snapshot с иными bytes не
перезаписывается. Schema/importer version входят в destination и manifest.

## Реальные поля → normalized storage

| Source | Сохранение |
| --- | --- |
| 12: exercise_id/version/name_ru/name_en | Stable keys и exact revision; все 203 строки, включая 3 REJECTED |
| concept_id/family_id/primary_pattern/exercise_type/minimum_level | Controlled source tokens + FK; не преобразуются в старые 24 movement или 26 equipment IDs |
| technical_prerequisites/strength_prerequisites/balance_requirements | Полный исходный текст; не превращается в придуманный dependency graph |
| primary_goal/load_type/assistance_mode/measurement_unit | Раздельные поля; assistance kg, device kg, dumbbell kg не склеиваются |
| setup/execution_standard/common_errors/progression_options/regression_options/limitations | Сохраняются без переформулирования в private catalog |
| display_muscles/evidence_notes/review_status/trainer_comment | Сохраняются вместе с source row; комментарий/наличие строки не approval |
| 13: все 21 поля | exercise_id/version + body/support/segment/laterality/grip/limb/resistance/ROM/contraction/fatigue/environment/status |
| 14: все 14 полей | Typed directed relations; definitions не становятся упражнениями |
| EQUIPMENT_REQUIRED requirement_group | OR комплектов, AND items внутри группы; отсутствие строк → unknown, не equipment-free |
| EQUIPMENT_OPTIONAL | Отдельные optional relations, не обязательные items |
| MUSCLE role/volume_role/volume_coefficient | PRIMARY/SECONDARY/STABILIZER отдельно от DIRECT/INDIRECT/STABILIZATION и nullable coefficient |
| LOCATION / SECONDARY_PATTERN / SECONDARY_GOAL / EVIDENCE / PROGRAM_TARGET | Сохранены source context, target, conditions и review state |
| 15: все 20 полей | Directed source/target revisions, A/B/C, goal/role/level/dose, differences/eligibility/adjustment, RECALIBRATE/confidence/reason/status |
| 16: все 26 полей | Full cycle/version, format/split/delivery/environment/goal/context/level/equipment/frequency/cycle days/weeks/time/specialization/rules/status |
| 17: все 15 полей | Scoped phase key `(program_id,program_version,phase_id)`, weeks, calendar cycle day, warmup и session |
| 18: все 25 полей | Slot instance ID, exact EX revision, ordered dose + minimum/skip/cut/pair rules; не exercise ID как slot ID |
| 19: все 16 полей | Original numeric values и formula/cache provenance; unknown coefficients/modelled_sets остаются null |
| 20: все 11 полей | Review log, entity/version/category, reviewer/date/comments/correction/supersedes без выдуманных решений |

12/13/16 содержат revision number; session связан с program_version. У slot и
volume нет собственного явного version field: source_version для SLOT relations
проверяется через parent program revision, а не назначается по умолчанию 1.
Volume привязан к program_id/phase_id без собственного program_version — schema
gap для будущей multi-revision cloud модели; текущий файл содержит одну revision
каждого program ID. Schema v1 input ожидает одну текущую запись ID; смешанный
исторический журнал revisions требует отдельного source adapter, не last-write-wins.

## Формулы и views

Raw cell содержит original expression, shared attributes и cached value отдельно.
Shared formulas переводятся с корректными relative/$ refs; оригинал не теряется.
Пустые/отсутствующие caches не равны нулю. При проверке известной суммирующей
грамматики используются только числовые операции/VLOOKUP по точным IDs — нет
Excel execution, eval, макросов или обращения по внешним ссылкам.

Все supporting/architecture листы сохранены в raw snapshot. 23–33 и 34–141
используются для сверки, не как второе хранилище canonical entities. Прямые row refs
в части visuals не становятся идентичностью importer; normalized связи используют IDs.

## Legacy mapping

[LEGACY_EXERCISE_MAPPING.csv](LEGACY_EXERCISE_MAPPING.csv) содержит все 45 старых IDs,
selected new revision только при определённом варианте, отдельный candidate_ids,
source rows, SHA256, confidence и evidence. Ambiguous selected ID пустой.
Decision в каждой строке KEEP_LEGACY_NO_HISTORY_MERGE; ни один runtime alias не создан.
Mapping валидируется на полноту, snapshot, names, source IDs/versions и решения.
Exact/renamed engineering match не означает разрешение переноса исторических кг.

## Допуск контента и следующие границы

`imported` / `validated` / `trainer_approved` / `published` — разные состояния.
Сейчас только imported. Структурная проверка не повышает source review_status;
NEEDS_REVIEW и REJECTED сохранены дословно. Promotion API/SQL/cloud upload нет.

[program-compatibility.csv](audit/program-compatibility.csv) содержит весь цикл,
реальную частоту/среду/goal/level и blockers по каждой программе.
[coverage.csv](audit/coverage.csv) содержит все 216 combinations, включая нули.
Нулевое полное engine compatibility не означает, что программы неправильные:
их phase/cycle/rules ещё не представлены текущим runtime. Старый Gym/3, workouts,
Session/Load/Progression, Coach/Progress/Nutrition и localStorage не менялись.
