import "dotenv/config";
import express, { type Request } from "express";
import { mapPaymentToReceipt, type Merchant, type PaymentEvent } from "./mapPaymentToReceipt.js";
import { createDocument, getDocument, downloadPdf } from "./twill.js";
import { isValidSignature } from "./verifySignature.js";

const PORT = Number(process.env.PORT ?? 3000);
const SIGNING_SECRET = process.env.WEBHOOK_SIGNING_SECRET ?? "";

const merchant: Merchant = {
  name: process.env.MERCHANT_NAME ?? "Your Business",
  address: process.env.MERCHANT_ADDRESS ?? "—",
  email: process.env.MERCHANT_EMAIL || undefined,
  tax_id: process.env.MERCHANT_TAX_ID || undefined,
};

const app = express();

// Capture the raw body so we can verify the webhook signature against the exact
// bytes the sender signed — re-serializing the parsed JSON would change them.
app.use(
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "twilldocs-webhook-receipt" });
});

/**
 * The payment webhook. A processor calls this when a payment succeeds; we turn
 * it into a receipt PDF.
 *
 * Key webhook discipline: do the minimum and respond fast. We create the Twill
 * document (a quick call that returns immediately with an id) and return 202
 * right away — we do NOT block waiting for the PDF to render, which could exceed
 * the sender's webhook timeout and trigger a retry. Fetch the finished PDF later
 * via GET /receipts/:id, or have Twill's document ready by the time you email it.
 */
app.post("/webhooks/payment", async (req: Request & { rawBody?: Buffer }, res) => {
  // 1. Authenticate the webhook (skipped only if no secret is configured).
  if (SIGNING_SECRET) {
    const signature = req.header("X-Signature");
    if (!req.rawBody || !isValidSignature(req.rawBody, signature, SIGNING_SECRET)) {
      return res.status(401).json({ error: "invalid signature" });
    }
  }

  const body = req.body as PaymentEvent;

  // 2. Only act on successful payments; acknowledge everything else so the
  //    sender doesn't retry.
  if (body?.event !== "payment.succeeded") {
    return res.status(200).json({ ignored: body?.event ?? "unknown" });
  }

  try {
    // 3. Map to Twill's receipt shape and create the document. The payment id
    //    is our idempotency key: a redelivered webhook reuses the same receipt
    //    instead of generating a duplicate.
    const input = mapPaymentToReceipt(body, merchant);
    const doc = await createDocument("receipt", input, `payment:${body.payment.id}`);

    console.log(`✅ payment ${body.payment.id} → receipt document #${doc.id} (${doc.status})`);
    return res.status(202).json({
      document_id: doc.id,
      status: doc.status,
      status_url: `/receipts/${doc.id}`,
    });
  } catch (err) {
    console.error("💥 failed to create receipt:", err instanceof Error ? err.message : err);
    // 500 tells a well-behaved sender to retry later.
    return res.status(500).json({ error: "failed to create receipt" });
  }
});

/**
 * Check a receipt's status and download it once ready. In a real app this is
 * where you'd email the customer a link or attach the PDF — here it just proves
 * the flow end to end.
 */
app.get("/receipts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid id" });

  try {
    const doc = await getDocument(id);
    if (doc.status !== "succeeded") {
      return res.status(200).json({ id, status: doc.status, error: doc.error ?? null });
    }
    const pdf = await downloadPdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="receipt-${id}.pdf"`);
    return res.send(pdf);
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`▶  webhook-receipt listening on http://localhost:${PORT}`);
  console.log(`   POST /webhooks/payment   — send a payment event`);
  console.log(`   GET  /receipts/:id       — check status / download the PDF`);
  if (!SIGNING_SECRET) console.log("   ⚠  WEBHOOK_SIGNING_SECRET is unset — signature checks are OFF (dev only)");
});
