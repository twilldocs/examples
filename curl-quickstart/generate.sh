#!/usr/bin/env bash
#
# Generate an invoice PDF using only curl — the raw Twill Docs wire protocol:
# create → poll → download. No SDK, no JSON tooling required.
#
set -euo pipefail
cd "$(dirname "$0")"

# Load .env if present (simple KEY=value lines).
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

if [ -z "${TWILL_API_KEY:-}" ]; then
  echo "TWILL_API_KEY is not set. Copy .env.example to .env and fill it in." >&2
  exit 1
fi
BASE_URL="${TWILL_BASE_URL:-https://www.twilldocs.com}"
AUTH="Authorization: Bearer ${TWILL_API_KEY}"

# Tiny JSON field extractors — fine for these small, known responses. In real
# code use jq (see the README) or your language's JSON parser, not regex.
id_of()     { sed -n 's/.*"id"[[:space:]]*:[[:space:]]*\([0-9]\{1,\}\).*/\1/p'; }
status_of() { sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([a-z]\{1,\}\)".*/\1/p'; }

# 1. Create the document — returns 202 with { "id", "status" }.
echo "📤 Creating invoice…"
created=$(curl -sS -X POST "${BASE_URL}/v1/documents" \
  -H "${AUTH}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen 2>/dev/null || date +%s)" \
  --data @invoice.json)

id=$(printf '%s' "$created" | id_of)
if [ -z "$id" ]; then
  echo "Unexpected response from create: $created" >&2
  exit 1
fi
echo "   Document #${id}"

# 2. Poll until the render finishes (succeeded / failed).
echo "⏳ Waiting for render…"
status=""
for _ in $(seq 1 60); do
  status=$(curl -sS "${BASE_URL}/v1/documents/${id}" -H "${AUTH}" | status_of)
  case "$status" in
    succeeded) break ;;
    failed) echo "Render failed for document ${id}." >&2; exit 1 ;;
  esac
  sleep 1
done
if [ "$status" != "succeeded" ]; then
  echo "Timed out waiting for document ${id} to render." >&2
  exit 1
fi
echo "   Succeeded ✅"

# 3. Download the finished PDF.
curl -sS -L "${BASE_URL}/v1/documents/${id}/download" -H "${AUTH}" -o "invoice-${id}.pdf"
echo "🎉 Saved invoice-${id}.pdf"
