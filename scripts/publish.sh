#!/usr/bin/env bash
# Commit and push data/state.json only. Pages redeploys in about a minute.
set -euo pipefail
cd "$(dirname "$0")/.."
msg="${1:-data: update observations}"
node -e "JSON.parse(require('fs').readFileSync('data/state.json','utf8'))"
git add data/state.json
if git diff --cached --quiet; then echo "no data changes"; exit 0; fi
git commit -q -m "$msg"
for i in 1 2 3 4; do
  if git push -q origin HEAD; then echo "pushed: $msg"; exit 0; fi
  sleep $((i * 2)); git pull -q --rebase origin main || true
done
echo "push failed after 4 attempts" >&2; exit 1
