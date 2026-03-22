#!/usr/bin/env bash
# Export Apple Reminders to JSON (macOS). Default output: ~/Desktop/apple-reminders-export.json
# Uses Swift/EventKit instead of AppleScript to avoid AppleEvent timeouts on large libraries.
# Usage:
#   bash tools/export-reminders.sh
#   bash tools/export-reminders.sh /path/to/out.json
#   bash tools/export-reminders.sh --include-completed
#   bash tools/export-reminders.sh ~/Desktop/out.json --include-completed
#   bash tools/export-reminders.sh ~/Desktop/out.json --list "Inbox"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWIFT_SCRIPT="$SCRIPT_DIR/export-apple-reminders.swift"
DEFAULT_OUT="${HOME}/Desktop/apple-reminders-export.json"

if [[ $# -ge 1 && "$1" != --* ]]; then
  OUT="$1"
  shift
else
  OUT="$DEFAULT_OUT"
fi

exec swift "$SWIFT_SCRIPT" "$OUT" "$@"
