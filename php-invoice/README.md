# Invoice PDF from PHP — Twill Docs

Generate a production-ready invoice PDF from structured data in **vanilla PHP** —
no framework, no dependencies, one API key.

```
 PHP array ──▶  Twill Docs  ──▶  invoice.pdf
             (validates, does
              the math, renders)
```

If your app already has the data (orders, subscriptions, billing runs), the
hard part isn't the data — it's turning it into a *correct* document: totals
that add up, currency formatting, tax lines, pagination, your branding, every
time. Doing that with a headless browser and HTML templates is a lot of fiddly
infrastructure to own. Here it's one API call: you send structured line items,
**Twill computes the totals server-side** and renders the PDF behind a retrying,
idempotent job queue.

## Prerequisites

- PHP 8.1+ with the `curl` and `json` extensions (both bundled with standard PHP)
- A [Twill Docs API key](https://www.twilldocs.com) (starts with `twdc_`)

No Composer install required — this example has **no runtime dependencies**.

## Setup

```bash
cp .env.example .env
# then edit .env and add your twdc_ key
```

## Run it

```bash
php generate.php
```

You'll see the document get created and rendered, then a PDF land in
`out/invoice-<id>.pdf`.

## How it works

| File | Role |
| ---- | ---- |
| [`src/TwillClient.php`](src/TwillClient.php) | A tiny ext-curl client: `createDocument()`, `waitForDocument()`, `downloadPdf()`. |
| [`generate.php`](generate.php) | Builds the invoice data, creates the document, polls until ready, saves the PDF. |

### The Twill API in three calls

```
POST /v1/documents            → 202 { "id": 123, "status": "pending" }
GET  /v1/documents/123        → { "id": 123, "status": "succeeded" }
GET  /v1/documents/123/download → the PDF bytes
```

Rendering is asynchronous and idempotent: the `Idempotency-Key` header (set
automatically by the client) makes a retried request return the original
document instead of billing a second render.

### You supply data, not totals

Look at the `$invoice` array in `generate.php` — there are no `subtotal`, `tax`,
or `total` fields. You provide line items and a tax rate; Twill does the money
math. That's the difference between "print some HTML" and a document you can
actually send a customer.

## Adapting this to your app

- **Your data.** Replace the hard-coded `$invoice` array with a build from your
  database or billing system.
- **Composer / autoloading.** A `composer.json` with PSR-4 autoloading is
  included if you'd rather `composer install` and use `vendor/autoload.php` —
  `generate.php` works either way.
- **Framework HTTP client.** In Laravel/Symfony you'd swap ext-curl for the
  framework's HTTP client; the request shapes are identical.
- **Other document types.** Swap `invoice` for `quote`, `receipt`,
  `purchase_order`, and others — same pattern, different input shape.
- **Branding.** Set your logo and colours once via Twill's `/v1/brand` endpoint
  and every document picks them up.

## License

MIT — use it as a starting point for your own integration.
