# Видеотека: manifest → review → metadata → player

## Фактическое состояние

Владелец сообщил о 103 файлах. Их местонахождение, имена, размеры, duration,
formats, checksum, лицензии и соответствия упражнениям не предоставлены.
Поэтому [VIDEO_MANIFEST.csv](VIDEO_MANIFEST.csv) содержит **только заголовок**.
Нет 103 фиктивных строк, угаданных EX IDs, uploads или ссылок на публичный bucket.

`client/src/features/exerciseVideo/` содержит готовый version-aware UI и metadata
контракт. Production library пуста, resolver не подключён. В карточке упражнения
отображается «Видео техники пока не добавлено», без мёртвой кнопки и requests.
Старое поле `Exercise.videos` и данные всех 45 упражнений не изменялись.

## Manifest

| Поле | Правило заполнения после получения файлов |
| --- | --- |
| source_file | Точное имя/относительный путь оригинала, без credentials/query токенов |
| exercise_id | Подтверждённый trainer mapping к stable ID; не приблизительный поиск по названию |
| exercise_version | Точная revision из snapshot; пустая не означает latest |
| video_type | technique / setup / detailed; ракурсы можно хранить отдельными assets |
| source_duration | Измеренная длительность оригинала в секундах; неизвестное оставить неизвестным |
| source_format | Измеренные container/codec, а не только расширение |
| storage_object_key | Будущий immutable revision-specific key без hostname, signed URL или secrets |
| publication_status | imported / validated / trainer_approved / published, явные отдельные gates |
| review_status | Исходное review состояние; NEEDS_REVIEW / REJECTED не активируются |
| checksum | `sha256:<64 lowercase hex>` точных исходных bytes |
| remarks | Variant/angle, evidence/rightsholder reference, review receipt; без персональных данных |

Инвентаризация должна добавить byte size, technical probe и rights/trainer receipts
в sidecar metadata до публикации. Разные source names с одним checksum —
кандидаты на duplicate file review, не доказательство двух упражнений. Разные
ракурсы одного упражнения — несколько assets, не несколько exercise IDs.
Транскодированный файл и poster получают собственные checksums; source checksum
остаётся у original. Manifest не конвертируется автоматически в published library.

## Metadata и версия

`ExerciseVideoMetadata` дополнительно хранит stable media ID, poster object key,
явное `rightsConfirmed` и title. Source review token нельзя автоматически
переименовывать в внутреннее `TRAINER_APPROVED`: нужен отдельный review receipt.
UI допускает только `publicationStatus=published`, `reviewStatus=TRAINER_APPROVED`,
`rightsConfirmed=true`, заполненные keys/checksum и точный `(exerciseId,version)`.
Это защита от ошибочной активации, не криптографическая проверка rights/approval.
Проверка bytes, provenance и прав производится в import/review pipeline.

Текущие 45 legacy упражнений **не имеют Google Sheets version**. Для возможных
legacy assets есть явная кодовая revision
`legacy-git:c072c8c0da7796feebb63757dc0d3b9115d2516e`. Это обозначение замороженного
каталога, не выдуманная версия source. Source asset `EX_…/version` не подходит
legacy ID автоматически; подключение потребует проверенного mapping и решения
о variant/version. У текущих production assets ни одной такой привязки нет.

## Воспроизведение

`ExerciseTechniqueVideo` выбирает metadata до requests. Только после нажатия
«Смотреть технику» вызывается переданный `VideoResolver(metadata, AbortSignal)`.
Он должен проверить доступ и вернуть свежие HTTPS video/poster URLs и MIME.
Сейчас ни реализации cloud resolver, ни public URL fallback нет.

Плеер использует native `<video controls playsInline preload="none">`, poster,
без autoplay. Видео и poster не создаются/не запрашиваются до нажатия. Нативные
controls дают play/pause, seek и volume в пределах возможностей WebView. Layout
width 100%, max-height 65dvh, object-fit contain; кнопки из дизайн-системы ≥48px.
При ошибке resolver, HTTP/media или неподдерживаемом codec есть честный fallback
и закрытие/повтор. При закрытии/смене revision запрос отменяется, media element
останавливается и освобождает src. Signed URLs не сохраняются в localStorage,
истории или manifest. Ничего не логируется и не отправляется в Supabase.

Для подключения: добавить только reviewed metadata, реализовать resolver в API
adapter, передать его компоненту. Не импортировать Storage SDK в Training Engine.
HTTPS validation не доказывает легальность hostname: allowlist/access enforcement
обязательны в доверенном resolver после выбора host.

## Host и acceptance gates

Supabase Storage — возможный будущий host, не включённый public bucket.
Сначала согласовать authenticated access, отсутствие client list лишних объектов,
TTL signed URLs, user-session boundaries, MIME/range/CORS, limits/egress и backups.
Обычная техника и приватные пользовательские Technique Review не смешиваются.
103 файла не помещать в GitHub, dist, fixtures или initial preload.

Перед alpha нужны реальные iOS/Android Telegram tests: inline playback, pause
при смене экрана, poster, слабая сеть, expired URL, retry, codec/container и
touch controls. Headless Chromium с синтетическим WebM проверяет компонент,
но не подтверждает совместимость всех будущих оригиналов с Telegram.
