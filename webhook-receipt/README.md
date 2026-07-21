# Payment Webhook → Receipt PDF — Twill Docs

Turn a payment webhook into a production-ready receipt PDF. A payment succeeds,
your processor calls your webhook, and Twill Docs renders a clean, correctly-
totalled receipt — **no LLM, one API key.**

```
 Payment succeeds ──▶  your webhook  ──▶  Twill Docs  ──▶  receipt.pdf
                    (map to receipt      (validates, does
                     input, respond       the math, renders)
                     fast)
```

This is the most common real-world trigger for document generation: money
changes hands, and a document has to exist. The example is **processor-agnostic**
— it accepts a plain payment payload you'd populate from Stripe, Paddle,
Braintree, your own billing system, or a test `curl`.

## Why Twill instead of a PDF library

Your app already has the payment data — the hard part isn't the data, it's
turning it into a *correct* document: totals that add up, currency formatted
right, tax lines, pagination, your branding, reliably, every time. That's a
surprising amount of fiddly work with a headless-browser-and-HTML setup. Here
it's one API call: you send structured line items, **Twill computes the totals
server-side** and renders the PDF behind a retrying, idempotent job queue.

## Prerequisites

- Node.js 18+ (uses the built-in `fetch`)
- A [Twill Docs API key](https://www.twilldocs.com) (starts with `twdc_`)

That's it — no Anthropic/LLM key for this one.

## Setup

```bash
npm install
cp .env.example .env
# then edit .env: add your twdc_ key and your business (merchant) details
```

## Run it

Start the server:

```bash
npm start
# ▶ webhook-receipt listening on http://localhost:3000
```

In another terminal, send the sample payment event:

```bash
curl -X POST http://localhost:3000/webhooks/payment \
  -H "Content-Type: application/json" \
  --data @sample-payload.json
# → { "document_id": 123, "status": "pending", "status_url": "/receipts/123" }
```

Then fetch the finished receipt (open it in a browser or save it):

```bash
curl -L http://localhost:3000/receipts/123 -o receipt.pdf
```

## How it works

| File | Role |
| ---- | ---- |
| [`src/server.ts`](src/server.ts) | Express server: the `/webhooks/payment` endpoint and a `/receipts/:id` status/download route. |
| [`src/mapPaymentToReceipt.ts`](src/mapPaymentToReceipt.ts) | Maps the generic payment payload to Twill's `receipt` input. **The only part you'd customize per processor.** |
| [`src/twill.ts`](src/twill.ts) | Twill client: `POST /v1/documents` → poll `GET /v1/documents/{id}` → download. |
| [`src/verifySignature.ts`](src/verifySignature.ts) | Optional HMAC-SHA256 signature check for incoming webhooks. |

### Three things this example gets right (and you should too)

- **Respond fast.** The webhook creates the Twill document (a quick call that
  returns an id immediately) and responds `202` — it does **not** block waiting
  for the PDF to render. Blocking risks exceeding the sender's webhook timeout
  and triggering duplicate retries. Fetch the finished PDF afterward.
- **Idempotency.** Webhooks get redelivered. The payment id is passed as Twill's
  `Idempotency-Key`, so a retried event reuses the original receipt instead of
  rendering (and billing) a duplicate.
- **Verify signatures.** Set `WEBHOOK_SIGNING_SECRET` and the server rejects any
  request without a valid `X-Signature`. Never trust an unauthenticated webhook
  in production — it's an open door to forged receipts.

### Amounts are in minor units

The payload's `unit_amount` is in the currency's **minor units** (e.g. cents) —
the near-universal payment-processor convention. The mapping converts to major
units for the human-readable receipt. Zero-decimal currencies (JPY) would need a
per-currency exponent; see the note in `mapPaymentToReceipt.ts`.

## Adapting this to your app

- **Your processor's shape.** Point your Stripe/Paddle/etc. webhook at
  `/webhooks/payment` and adjust `PaymentEvent` + `mapPaymentToReceipt` to match
  its payload. The Twill half doesn't change.
- **Other document types.** Swap `template: "receipt"` for `invoice`, `quote`,
  `purchase_order`, and others — same pattern, different input shape.
- **Delivery.** Replace the `/receipts/:id` demo route with your real flow: email
  the customer a link, attach the PDF, or store it against the order.
- **Branding.** Set your logo and colours once via Twill's `/v1/brand` endpoint
  and every receipt picks them up.

## License

MIT — use it as a starting point for your own integration.
