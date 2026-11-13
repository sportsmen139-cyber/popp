# Source snapshots — пока пусто

Не создавать фиктивный snapshot или checksum. Реального XLSX/CSV здесь ещё нет.
До первого commit источника проверить разрешение владельца на распространение
текстов/видео и отсутствие персональных данных, credentials, скрытых листов с
секретами, комментариев и внешних ссылок с токенами. Приватный snapshot допустим
в отдельном контролируемом хранилище; его SHA256 и воспроизводимый manifest можно
держать в Git без публикации оригинала.

Receipt будущего snapshot должен содержать:

- `source_spreadsheet_id`: `1RbkoiW_6cq4UbojCPBrYmNRmt_sOEA8VMHGpDxoas-0`;
- source URL и дату/время фактического экспорта (`captured_at`, timezone);
- формат и SHA256 точных исходных bytes, размер, schema/importer version;
- workbook sheet names/IDs и исходные row numbers;
- физические строки, unique keys, blank/duplicate/invalid/rejected/review counts;
- исходные formula strings + cached results и статус свежести/recalculation;
- audit diagnostics, normalized output hash, отдельный publication review receipt.

Сначала сохранить оригинал без пересохранения/пересортировки, вычислить SHA256
локальным `sha256sum`, затем извлекать данные read-only. Повтор одного receipt
не создаёт новые IDs/revisions и не меняет review decisions. Исправления — новый
snapshot и новый отчёт, а не изменение применённого релиза.
