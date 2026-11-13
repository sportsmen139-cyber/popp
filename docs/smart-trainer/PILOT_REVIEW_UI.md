# Локальный Trainer Review: запуск и границы

Stage 3 подготовлен поверх `fa336d6` в `feature/smart-trainer-catalog-alpha`.
Пилот `PRG_000002` v1 проверяется в отдельном инструменте. Mini App и текущий
Training Engine не подключаются к этому UI.

## Что подготовлено

Snapshot с SHA256 `1919449150c40600c12d719b415ba1792ac331a8d29be2e4c6191f36f18a904a`
найден; checksum catalog совпал с сохранённым manifest. Из него выделены:

- 10 основных EX revisions, 3 фазы, 9 сессий, 45 slots, 8 номинальных недель;
- 18 explicit альтернатив и 90 slot links, 18 дополнительных EX revisions;
- только необходимые biomechanics, muscles/equipment/location relations, определения,
  инструкции/ограничения, source rules и weekly volume пилота;
- 177 карточек: 28 EX, 18 ALT, 26 equipment, 35 muscle, 11 concept, 17 family,
  9 pattern, 32 evidence и 1 program. Они покрывают 829 уникальных source records.

Все 829 записей NEEDS_REVIEW. REJECTED source records не входят в выборку;
builder отказывает, если обнаруживает отклонённую запись в том числе во вложенном
payload. Альтернативы целевых упражнений не раскрываются транзитивно.
Машинный scope: [pilot/summary.json](pilot/summary.json).

Права на распространение полного контента не установлены. Bundle, исходник,
журнал и реально отображаемый контент остаются в ignored `.local/smart-trainer/`.
В Git находятся только исходный код инструмента, тесты, вопросы и агрегированный отчёт.
Фактических решений тренера в этом этапе не создано; release не подготовлен к активации.

## Открытие в текущей рабочей среде

Из `/workspace/popp`:

```sh
python -m tools.smart_trainer.review prepare --snapshot .local/smart-trainer/1919449150c40600c12d719b415ba1792ac331a8d29be2e4c6191f36f18a904a/schema-1-importer-1.0.0
python -m tools.smart_trainer.review serve --bundle .local/smart-trainer/trainer-review/PRG_000002-v1/2df06832f5dff2e8e07fe29e839cc4119dd3c4c474d6acca36a080300d94431c/bundle.json --port 5188
```

После запуска открыть **http://127.0.0.1:5188/** на той же машине.
`prepare` сообщает реальный bundle_file и hash; если они изменились после нового
snapshot/состава, использовать новый путь из вывода. Старый bundle не перезаписывается.

**Это локальная ссылка, не внешний адрес облачной среды.** На телефоне или другом
компьютере `127.0.0.1` указывает на само это устройство. Для внешнего доступа нужен
контролируемый приватный доступ/защищённый туннель с сохранением локального origin
либо запуск инструмента на компьютере тренера. Публичная ссылка не выдаётся.
Не отключать Host/Origin/CSRF проверки ради открытого hosting.

## Если тренер работает на своём компьютере

Нужны Python 3.12+ на POSIX-системе (используются файловые locks), код feature-ветки
и приватная копия того же XLSX. Cloud credentials, Supabase, Node и Telegram SDK
для самого review UI не требуются. Node/Chromium нужны только браузерным тестам.

В новом checkout сначала восстановить **данные из настоящего файла**, не из памяти:

```sh
python -m tools.smart_trainer --source '/private/path/Умный тренер.xlsx'
python -m tools.smart_trainer.review prepare --snapshot .local/smart-trainer/1919449150c40600c12d719b415ba1792ac331a8d29be2e4c6191f36f18a904a/schema-1-importer-1.0.0
```

Затем `serve --bundle <bundle_file из вывода> --port 5188`. Если snapshot отсутствует
или checksum не совпадает, подготовка останавливается; содержимое не реконструируется.
Не добавлять private XLSX/bundle в публичный checkout через force-add.

## Как работает проверка

Программа показывает все 8 номинальных недель с фазами и днями 1/3/5. Это 24
плановых показа сессий, не 24 выполненные тренировки. Есть фильтры основных EX,
целевых EX замен, ALT и необходимых определений по видам. Карточки показывают
технику, ошибки, equipment kits, мышечные роли, уровень, progressions/regressions,
биомеханику, ограничения, исходные замечания и точные source row/version.

Review unit имеет явный состав source records, доступный до действия. Например
решение по EX охватывает именно его source row, biomechanics и перечисленные
связи. Общие equipment/muscle/прочие определения проверяются отдельно. Решение
по ALT охватывает его revisions/контекст и явные slot links. Программа включает
свой cycle/session/slot/volume/rules scope и зависит от остальных карточек.

Проверяющий всегда вводится вручную, начальных APPROVED нет. Действия:

- «Утвердить» — только после отдельно утверждённых зависимостей;
- «Требуется исправление» / «Отклонить» — с комментарием;
- «Оставить комментарий» — заметка, не утверждение;
- пакетное утверждение — только для явно отмеченных показанных зависимостей,
  с явным подтверждением. Родитель не утверждается тем же batch, если до него
  зависимости ещё не имели решений.

Source review_status не меняется. UI отдельно показывает source status и текущее
решение журнала. Для исправления контента нужен новый source/контролируемая typed
revision; комментарий не превращается автоматически в машинное правило.
Unknown equipment и reps→seconds не считаются разрешёнными одним комментарием.

## Журнал и сохранность

Default: `.local/smart-trainer/trainer-review/journals/PRG_000002-v1.json`.
Он отделён от immutable snapshot и от трёх Mini App localStorage keys.
Журнал логически append-only: source SHA256, bundle/record hashes, entity ID/version,
scope, reviewer, UTC timestamp, action/comment, явный acknowledgement и hashes
решений зависимостей. UI отображает время в Москве; исходный timestamp остаётся UTC.

Файл сохраняется через lock + временный файл + fsync + atomic replace с mode 0600.
JSON export доступен явным действием. Source XLSX/каталог и прежняя история не
изменяются. Hash chain помогает обнаружить повреждение, но не является цифровой
подписью или проверенной личностью тренера: имя локально заявлено самим оператором.
Для production governance позже потребуются отдельно выбранные identity/approval rules.

Новое source SHA/bundle/version не наследует approvals. При новом решении
зависимости прежнее parent approval становится stale и требует явной повторной
проверки. Комментарий не отзывает approval, но новый release candidate всё равно
привязан к точному journal head. Два окна используют optimistic head check:
устаревший запрос получает conflict и не перезаписывает чужие решения.

При ошибке записи UI не утверждает, что всё сохранено. Нужно обновить состояние
журнала; retry с прежним head не создаёт дубликат после уже выполненной записи.
Черновики комментариев живут только до закрытия страницы.

Локальный сервис слушает только loopback, проверяет Host/Origin/CSRF, ограничивает
JSON body, не включает CORS, не логирует reviewer/comment и не отдаёт каталог
файлов, исходный XLSX или endpoint публикации. Это приватный локальный инструмент,
не production auth service и не подключение Supabase.

## Versioned release — подготовленный механизм

`review/release.py` содержит чистые функции, без deploy/cloud/file publication:

1. `prepare_candidate` проверяет source/структуру повторно, exact approvals всех
   обязательных units, текущее programme approval и unresolved source contracts.
2. Engine attestation должна назвать точный engine commit, весь required capability
   набор и evidence; rights receipt — точный source/bundle, reviewer/time/evidence.
   Это контракт для будущих независимо проверяемых отчётов, не утверждение, что
   нынешний Engine уже прошёл проверку. Настоящих attestations сейчас нет.
3. Candidate связывает release semver отдельно от program version, source/bundle,
   record hashes и journal head. Сам candidate ничего не активирует.
4. `authorize_offline_release` требует **отдельное** `activate_release` решение по
   exact candidate hash и заново проверяет gates. Результат остаётся private
   offline authorization: runtime_enabled=false, publication_performed=false.
   Публичного publisher/активации Mini App в этом этапе нет.

Текущий пилот заблокирован отсутствием решений, явных equipment contracts,
typed назначения ALT_000476, подтверждённых Engine capabilities и прав. Даже
прохождение локальных gates в синтетических тестах не публикует реальные данные.
Будущий publisher должен отдельно сформировать пользовательскую projection без
частного журнала, reviewer identities и служебных approval комментариев.

## Проверки

```sh
python -m unittest discover -s tools/smart_trainer/tests -t . -v
cd client
npm test
npm run build
npm run lint
node scripts/trainer-review-browser.mjs '<private bundle.json>' '../docs/smart-trainer/pilot/browser-review.json'
```

Stage 3 добавляет 29 Python tests (всего 65 с предыдущими 36): workflow/version/
snapshot/dependency gates, source REJECTED, corrupt/stale journal, persistence,
disk errors, release/activation, private local HTTP boundaries. Браузерные tests
используют реальный scope, но **только отдельный временный synthetic journal**.
Никакого автоутверждения настоящего контента. Отчёт: [browser-review.json](pilot/browser-review.json).

Пилотные вопросы: [PILOT_TRAINER_REVIEW.md](PILOT_TRAINER_REVIEW.md).
Следующий engine этап: [PILOT_ENGINE_PLAN.md](PILOT_ENGINE_PLAN.md).
