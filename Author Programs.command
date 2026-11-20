#!/bin/bash
# Private source preview only; no deployment, source edits or automatic installation.
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
  printf '%s\n' 'Нужен Python 3.12 или новее: https://www.python.org/downloads/macos/'
  read -r -p 'Нажмите Enter, чтобы закрыть окно. ' _
  exit 1
fi
"$REVIEW_PYTHON" -m tools.smart_trainer.author_programs "$@"
REVIEW_RESULT=$?
if [ "$REVIEW_RESULT" -ne 0 ]; then
  printf '%s\n' 'Просмотр не запущен. Если порт 5191 занят, закройте предыдущее окно или используйте --port 0.' 'Инструкция: docs/smart-trainer/AUTHOR_PROGRAMS_ALPHA.md'
  read -r -p 'Нажмите Enter, чтобы закрыть окно. ' _
fi
exit "$REVIEW_RESULT"
