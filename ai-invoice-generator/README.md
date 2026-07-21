# AI Invoice Generator — Claude + Twill Docs

Turn a plain-English billing request into a production-ready invoice PDF:

> _"Bill Acme Corp for 3 days of consulting at $1,200/day plus $340 expenses, net 30, add 8.5% tax."_

…becomes a clean, correctly-totalled invoice PDF — in one script.

```
 Plain English ──▶  Claude  ──▶  structured invoice  ──▶  Twill Docs  ──▶  invoice.pdf
                (extracts facts)     (typed JSON)        (validates, does the
                                                          math, renders the PDF)
```

## Why this is more than "an LLM that writes a PDF"

The tempting shortcut is to ask an LLM to emit HTML and print it. It looks fine
in the demo and quietly falls apart in production: **language models are bad at
arithmetic**, so subtotals drift, tax is off by a cent, and you've emailed a
customer an invoice that doesn't add up.

This example splits the work along the line each tool is actually good at:

- **Claude** does the _language_ job — reading the request and identifying the
  parties, line items, quantities, unit prices, dates, and tax rate. It is
  explicitly never asked to compute a total.
- **Twill Docs** does the _document_ job — validating that structured input
  against the invoice schema, computing every monetary total server-side, and
  rendering a paginated, branded PDF with headless Chrome behind a retrying,
  idempotent job queue.

That's the difference between a screenshot and a document you can send.

## Prerequisites

- Node.js 18+ (uses the built-in `fetch`)
- An [Anthropic API key](https://console.anthropic.com/) — this is a
  pay-as-you-go **API** key from the Anthropic Console, billed per token. A
  Claude Pro/Max or Claude Code **subscription does not include one** and does
  not cover API usage; they are separate products. The calls in this example
  are tiny (a fraction of a cent each), and new API accounts usually start with
  free credit.
- A [Twill Docs API key](https://www.twilldocs.com/) (starts with `twdc_`)

## Setup

```bash
npm install
cp .env.example .env
# then edit .env and add your two API keys
```

## Run it

With the built-in demo request:

```bash
npm start
```

Or describe your own invoice in plain English:

```bash
npm start "Invoice GlobalTech £2,500 for a website redesign plus £400/mo hosting for 3 months, due in 14 days, 20% VAT"
```

You'll see the structured data Claude extracted, then a finished PDF written to
`out/invoice-<id>.pdf`.

## How it works

| Step | File | What happens |
| ---- | ---- | ------------ |
| 1. Extract | [`src/generateInvoice.ts`](src/generateInvoice.ts) | Claude is called with a forced **tool** whose input schema is the invoice shape, so it returns typed JSON — never prose to parse. |
| 2. Schema | [`src/invoiceSchema.ts`](src/invoiceSchema.ts) | One definition shared by the Claude tool and the Twill request. Note there are no `total`/`subtotal` fields — by design. |
| 3. Render | [`src/twill.ts`](src/twill.ts) | `POST /v1/documents` → poll `GET /v1/documents/{id}` until `succeeded` → `GET …/download`. |
| 4. Orchestrate | [`src/index.ts`](src/index.ts) | Wires the three steps together into one command. |

### The Twill API in three calls

```http
POST /v1/documents
Authorization: Bearer twdc_...
Idempotency-Key: <unique>
Content-Type: application/json

{ "template": "invoice", "input": { ...structured invoice... } }
→ 202 { "id": 123, "status": "pending" }
```

```http
GET /v1/documents/123        → { "id": 123, "status": "succeeded" }
GET /v1/documents/123/download → the PDF bytes
```

Rendering is asynchronous and idempotent: the `Idempotency-Key` header makes a
retried request return the original document instead of billing a second
render.

## Adapting this to your app

- **Other document types.** Twill ships templates for quotes, receipts, purchase
  orders, delivery notes, payslips, offer letters, NDAs, and service agreements.
  Swap `template: "invoice"` and the tool schema for another shape and the same
  pattern holds.
- **Bring your own data.** The Claude step is optional. If your app already has
  structured invoice data (from a form, a database, your billing system), skip
  straight to `createInvoiceDocument()`.
- **Branding.** Set your logo and colours once via the `/v1/brand` endpoint and
  every rendered document picks them up.

## License

MIT — use it as a starting point for your own integration.
