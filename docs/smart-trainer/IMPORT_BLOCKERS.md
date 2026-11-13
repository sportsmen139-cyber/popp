# Блокирующие условия и необходимые входные данные

Все пункты относятся к feature-ветке. Ничего не объединено с main и не выложено
в production. Серверная авторизация/Supabase остаются на паузе.

| ID | Что отсутствует | Что блокируется | Что нужно получить / проверить |
| --- | --- | --- | --- |
| SOURCE-01 | Полный snapshot; Google endpoints недоступны (proxy 403) | Аудит реальных строк 1–5, counts, schema validation, FK, импорт | Полный XLSX или полный read-only snapshot с source rows, formulas/cached values, временем выгрузки и разрешением хранить контент |
| MAP-01 | Биомеханика/версии новых упражнений | Любые legacy aliases и перенос результатов | Review всех 45 строк CSV тренером по grips/machine/angle/unilateral/assistance/resistance/ROM; ни approximate name matching, ни общий перенос кг |
| REVIEW-01 | Утверждение упражнений/программ/связей | Публикация новой библиотеки и автоматические замены | Раздельные решения trainer approval + validation + publish release; NEEDS_REVIEW и REJECTED всегда закрыты |
| ENGINE-01 | Данные о полном цикле и реализация недостающих возможностей | Подключение 108 циклов к resolver | Coverage matrix по реальным строкам, phases/weeks/cycle state/time/distance/units/RIR/miss/fatigue/adaptation review и regression review |
| VIDEO-01 | 103 исходных файла, metadata, привязки | Реальные ролики в карточках | Read-only место хранения; имена/байты/duration/format/checksum/дубликаты; точные exercise+version+type и разрешение на использование |
| VIDEO-02 | Storage/access rules, posters, mobile encoding | Video resolver/доставка | Выбрать host и правила доступа, запрет list/public mass access без решения; HTTPS resolver, срок подписанных URLs, поддерживаемые codecs, WebView smoke-test |
| FEEDBACK-01 | Подтверждённый канал владельца | Отзывы от тестировщиков в нужный чат | Username в `VITE_FEEDBACK_TELEGRAM_USERNAME`, разрешение на входящие, проверить web/iOS/Android Telegram; для бота отдельно Start/приём сообщений/доставка владельцу |
| BRAND-01 | Страны запуска, проверяемые реестры/домены, решение владельца | Финальное название и rebranding | Выбрать рынки, проверить exact/phonetic/semantic marks + домены + stores/Telegram; затем отдельный commit |
| RELEASE-01 | Принятие feature-ветки, native smoke-test и сценарий сохранения данных | Alpha rollout | Review ветки, реальный Telegram, origin/localStorage continuity; новый URL не переносит старые данные автоматически |

Недоступность источника не блокирует обратную связь, generic видео UI и подготовку
документов. Она блокирует утверждения о реальном содержимом и готовности импорта.
SQL migrations, credentials, deploy, создание аккаунтов, upload видео и изменения
бота не являются обходом этих условий и здесь не выполняются.

Порядок продолжения: SOURCE-01 → аудит и source schema → MAP-01 → preview/import
validation → trainer review → engine coverage/regression → отдельное решение
о публикации. Feedback можно включить раньше после проверки канала.
