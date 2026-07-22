# Twill Docs — raw API quickstart (curl)

The Twill Docs API on the wire — no SDK, no language runtime. If you're
integrating from a language we don't ship an SDK for, or you just want to see
exactly what the requests look like, start here.

The whole flow is **three calls**: create a document, poll until it's rendered,
download the PDF.

## Prerequisites

- `curl`
- A [Twill Docs API key](https://www.twilldocs.com) (starts with `twdc_`)

## The three calls

Set your key and base URL first:

```bash
export TWILL_API_KEY=twdc_...
export TWILL_BASE_URL=https://www.twilldocs.com
```

### 1. Create a document

`POST /v1/documents` validates the input against the template's schema, creates
the document, and queues the render — returning `202` immediately with an id.
The `Idempotency-Key` makes a retry safe: you get the original document back
instead of a duplicate render.

```bash
curl -sS -X POST "$TWILL_BASE_URL/v1/documents" \
  -H "Authorization: Bearer $TWILL_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  --data @invoice.json
# → {"id":123,"status":"pending"}
```

### 2. Poll until it's ready

`GET /v1/documents/{id}` returns the current status: `pending` → `processing` →
`succeeded` (or `failed`).

```bash
curl -sS "$TWILL_BASE_URL/v1/documents/123" \
  -H "Authorization: Bearer $TWILL_API_KEY"
# → {"id":123,"status":"succeeded","error":null,"created_at":"..."}
```

### 3. Download the PDF

`GET /v1/documents/{id}/download` returns the PDF bytes (once `succeeded`).

```bash
curl -sS -L "$TWILL_BASE_URL/v1/documents/123/download" \
  -H "Authorization: Bearer $TWILL_API_KEY" \
  -o invoice.pdf
```

## Run the whole flow

[`generate.sh`](generate.sh) does all three calls end to end using only `curl`
(no `jq` or other tooling required):

```bash
cp .env.example .env   # add your twdc_ key
./generate.sh
# 📤 Creating invoice…
# ⏳ Waiting for render…
# 🎉 Saved invoice-123.pdf
```

The request body is in [`invoice.json`](invoice.json) — edit it to change the
document.

## Parsing responses: use jq in real scripts

`generate.sh` extracts the `id` and `status` with `sed` to stay dependency-free,
which is fine for these small, known responses. In a real script, use
[`jq`](https://jqlang.github.io/jq/) instead of regex:

```bash
id=$(curl -sS -X POST "$TWILL_BASE_URL/v1/documents" \
  -H "Authorization: Bearer $TWILL_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  --data @invoice.json | jq -r '.id')

status=$(curl -sS "$TWILL_BASE_URL/v1/documents/$id" \
  -H "Authorization: Bearer $TWILL_API_KEY" | jq -r '.status')
```

## Other document types

Swap the `template` and `input` in `invoice.json` for any Twill template —
`quote`, `receipt`, `purchase_order`, `payslip`, and more. The three-call flow is
identical for all of them.

## License

MIT — use it as a starting point for your own integration.
