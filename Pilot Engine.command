#!/bin/bash
# Finder launch; quoted paths support spaces and Cyrillic. No download/install or credentials.
set -u
REVIEW_ROOT="$(cd -- "$(dirname -- "$0")" && pwd)"
cd -- "$REVIEW_ROOT" || exit 1
REVIEW_PYTHON=""
for candidate in "${POPP_PYTHON:-}" "$REVIEW_ROOT/.local/smart-trainer/python/bin/python3" python3.12 python3.13 python3.14 /opt/homebrew/bin/python3 /usr/local/bin/python3 python3; do
  if [ -n "$candidate" ] && command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' >/dev/null 2>&1; then
    REVIEW_PYTHON="$candidate"
    break
  fi
done
if [ -z "$REVIEW_PYTHON" ]; then
  printf '%s\n' 'Нужен Python 3.12 или новее. Системного Python 3.9 недостаточно.' 'Установите Python с https://www.python.org/downloads/macos/ и откройте этот файл снова.' 'Инструкция: docs/smart-trainer/PILOT_ENGINE.md'
  read -r -p 'Нажмите Enter, чтобы закрыть окно. ' _
  exit 1
fi
"$REVIEW_PYTHON" -m tools.smart_trainer.review local --choose-source --interface pilot "$@"
REVIEW_RESULT=$?
if [ "$REVIEW_RESULT" -ne 0 ]; then
  printf '%s\n' 'Запуск остановлен. Если порт 5188 занят, закройте предыдущее окно сервера или запустите с --port 0.' 'Инструкция: docs/smart-trainer/PILOT_ENGINE.md'
  read -r -p 'Нажмите Enter, чтобы закрыть окно. ' _
fi
exit "$REVIEW_RESULT"
