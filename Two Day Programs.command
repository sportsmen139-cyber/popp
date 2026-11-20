#!/bin/bash
# Reuse the existing private launcher. No deployment or source conversion.
REVIEW_ROOT="$(cd -- "$(dirname -- "$0")" && pwd)"
exec "$REVIEW_ROOT/Author Programs.command" --batch two-day "$@"
