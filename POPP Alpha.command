#!/bin/bash
# Local preview of the built Mini App. No publication, credentials or cloud changes.
set -u
POPP_ALPHA_ROOT="$(cd -- "$(dirname -- "$0")" && pwd)"
cd -- "$POPP_ALPHA_ROOT/client" || exit 1
POPP_ALPHA_NODE=""
for candidate in /opt/homebrew/bin/node /usr/local/bin/node node; do
  if command -v "$candidate" >/dev/null 2>&1; then
    POPP_ALPHA_NODE="$candidate"
    break
  fi
done
if [ -z "$POPP_ALPHA_NODE" ] || [ ! -f node_modules/vite/bin/vite.js ] || [ ! -f dist/index.html ]; then
  printf '%s\n' 'Для локального просмотра нужны Node.js, зависимости и готовая сборка.' 'В Terminal из папки client выполни: npm ci, затем npm run build.' 'Инструкция: docs/ALPHA_RELEASE.md'
  read -r -p 'Нажми Enter, чтобы закрыть окно. ' _
  exit 1
fi
printf '%s\n' 'Открывается локальная alpha POPP Fitness. Оставь это окно открытым.' 'Это просмотр на Mac. Публикация и настройки Telegram не изменяются.'
"$POPP_ALPHA_NODE" node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5189 --strictPort --open
POPP_ALPHA_STATUS=$?
if [ "$POPP_ALPHA_STATUS" -ne 0 ]; then
  printf '%s\n' 'Не удалось запустить просмотр. Если alpha уже открыта, используй http://127.0.0.1:5189/.' 'Порт не меняется автоматически, чтобы записи оставались на том же адресе.'
  read -r -p 'Нажми Enter, чтобы закрыть окно. ' _
fi
exit "$POPP_ALPHA_STATUS"
