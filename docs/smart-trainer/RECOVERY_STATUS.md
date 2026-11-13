# Recovery checkpoint — 2026-11-13

## Что сохранилось

Среда вернулась с прежним незакоммиченным состоянием. Репозиторий:
`/workspace/popp`; ветка `feature/smart-trainer-catalog-alpha`; HEAD до recovery
commit: `c072c8c0da7796feebb63757dc0d3b9115d2516e`. Ветка действительно основана
на сохранённом редизайне, не на старом main. Stash пуст.

До исправлений сохранены все **22** изменённых/новых файла в локальный архив
`/tmp/popp-recovery-20261113T121455Z/uncommitted.tar.gz`, binary diff и SHA256
manifest. Содержимое всех 22 файлов в архиве сверено с manifest. Этот архив
является дополнительной временной копией; долговременное сохранение — Git commit
и обычный push feature-ветки. Архив и служебный manifest не включаются в Git.

| Сохранённые файлы | Назначение |
| --- | --- |
| `client/src/features/feedback/{FeedbackScreen.tsx,feedback.ts,feedback.css,feedback.test.ts}` | Форма, handoff/clipboard adapters, стили и unit tests |
| `client/src/features/exerciseVideo/{ExerciseTechniqueVideo.tsx,videoLibrary.ts,exerciseVideo.css,videoLibrary.test.ts}` | Version-aware media gate, native on-demand player, стили и tests |
| `client/scripts/alpha-review.mjs` | Реальные browser проверки компонентов с синтетическими fixtures |
| `client/.env.example`, `client/package.json` | Пустая публичная настройка контакта и test:alpha command |
| `client/src/App.tsx`, `client/src/index.css` | Доступ к feedback, честное empty video state и focus textarea |
| `IMPORT_AUDIT.md`, `IMPORT_BLOCKERS.md`, `SCHEMA_MAPPING.md` | Источник/гейты/проект mapping без выдуманных данных |
| `LEGACY_EXERCISE_MAPPING.csv` | 45 legacy IDs; новые IDs и версии ещё не назначены |
| `VIDEO_MANIFEST.csv`, `VIDEO_LIBRARY.md`, `ALPHA_FEEDBACK.md` | Пустой manifest, metadata/player/access и настройка канала |
| `BRANDING_RECOMMENDATION.md`, `snapshots/README.md` | Shortlist с границами проверки и правила будущего snapshot |

## Исправление и проверки

Alpha runner импортировал Vite-optimized CommonJS ReactDOM как ESM с именованным
`createRoot`, хотя этот модуль экспортирует default. Исправлены **оба** импорта:
default React и default ReactDOM, затем `ReactDOM.createRoot`. Production UI не
менялся для обхода ошибки тестового стенда.

| Проверка | Результат |
| --- | --- |
| `cd client && npm test` | **319 passed**, 27 файлов; все прежние 285 тестов сохранены |
| `cd supabase/functions && deno task test` | **34 passed**, deny-env/net/read/write/run |
| `cd client && npm run build` | Успешно |
| `cd client && npm run lint` | Успешно, включая alpha runner |
| `cd client && npm run test:ui` | **31 passed**, прежние storage fixtures совпали |
| `cd client && npm run test:alpha` | **13 passed**, реальные формы/медиа DOM |
| WCAG A/AA Axe | 9 прежних + 3 alpha audits, violations нет |
| Новый код/документы: шаблоны секретов | В исходных 22 файлах совпадений с bot token, GitHub token, secret key, private key, JWT, AWS access key не найдено |
| Git ignore | Настоящие `.env.local`/`.env.production`/server `.env` игнорируются; `.env.example` отслеживается |
| Protected paths vs `c072c8c` | `domain`, `storage`, `data`, `types`, `supabase`, BACKEND_ARCHITECTURE.md без изменений |
| App.tsx | Все 11 прежних format/handler functions структурно идентичны через TypeScript AST printer |

Machine reports: [UI regression](test-reports/ui-review.json),
[alpha components](test-reports/alpha-review.json). Screenshots и синтетический
WebM остались временными test artifacts, не production assets. Все media requests
в alpha test перехватываются локально, сообщения и настоящие видео не отправляются.

Среда проверки: Node v24.19.0, Chromium 154.0.8037.57 (Debian), Deno 2.9.6.
`test:alpha` требует установленный Chromium (`POPP_BROWSER_PATH` при необходимости)
и `ffmpeg` с libvpx для временного синтетического WebM. Ни один из них не является
runtime-зависимостью Mini App. Новый production dependency не добавлен.

Это **не** native Telegram iOS/Android тест и не end-to-end доставка владельцу.
Настоящий feedback username отсутствует; форма честно показывает setup state,
копирование доступно. 103 видео отсутствуют, manifest пуст; UI не угадывает URLs.

## Excel и importer

Recovery-задание упоминает XLSX «Умный тренер — архитектура базы и шаблоны
проверки.xlsx». В attachments доступен только `Вставленный текст.txt` с самим
заданием, XLSX/XLS/ZIP/CSV не найден. Запрошена отдельная read-only ссылка на Excel.

**Excel не прочитан.** Его hash, дата экспорта, 142 вкладки/used ranges, фактические
203/200/3 упражнения, 108 программ и FK пока не проверены. Числа из задания
остаются reported counts. У текущего кода независимо подтверждены 45 уникальных
legacy IDs и прежняя активная Gym/3 программа. Source mapping не придуман.

Importer ещё **не готов**: нет подтверждённых заголовков/типов колонок и исходных
строк. Не создаётся parser под предполагаемую схему с ложным passing report.
После фактического получения XLSX, уже после сохранения recovery в GitHub:

1. Сохранить оригинальные bytes read-only, вычислить SHA256, зарегистрировать
   полученную дату и настоящую export date отдельно (не считать mtime датой snapshot).
2. Проинвентаризировать все листы/used ranges, формулы и cached values, проверить
   00–11 и обзоры 23–141; нормализованные программы читать из 16–19.
3. Выполнить аудит строк, counts, versions/statuses/FK, оборудования, фаз/недель,
   units, substitutions и составить 45 строк evidence-based mapping.
4. Реализовать source-specific schema validation и идемпотентный versioned
   importer в изолированный preview; сохранить raw review_status и source provenance.
5. Показать реальные несовместимости, проверить regression, затем отдельно
   trainer review/publication. Не включать все 108 циклов в resolver автоматически.

Текущие известные ограничения Engine описаны в [SCHEMA_MAPPING.md](SCHEMA_MAPPING.md):
нет cycle phases/weeks scheduler; UI frequency 2/3/4 исключает 1; наличие time/
distance в типе target не означает полноценный logger/Load Engine для этих units;
новые RIR/fatigue/miss/substitution rules ещё не реализованы. Это ограничения кода,
не найденные ошибки конкретных непрочитанных строк Excel.

Main остаётся `b9c38f4b277bce7f9f549b91bd57b01e83c74666`. Merge, production deploy,
cloud auth/DDL, uploads, изменение названия и URL в recovery не выполняются.
