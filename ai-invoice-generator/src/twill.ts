import { randomUUID } from "node:crypto";
import type { InvoiceInput } from "./invoiceSchema.js";

const BASE_URL = (process.env.TWILL_BASE_URL ?? "https://www.twilldocs.com").replace(/\/$/, "");
const API_KEY = process.env.TWILL_API_KEY;

type DocumentStatus = "pending" | "processing" | "succeeded" | "failed";

interface DocumentResponse {
  id: number;
  status: DocumentStatus;
  error?: string | null;
  created_at?: string;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  if (!API_KEY) {
    throw new Error("TWILL_API_KEY is not set. Copy .env.example to .env and fill it in.");
  }
  return {
    Authorization: `Bearer ${API_KEY}`,
    Accept: "application/json",
    ...extra,
  };
}

async function readError(res: Response): Promise<string> {
  const body = await res.text();
  return `${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`;
}

/**
 * Kick off a render. Twill validates the input against the invoice template's
 * schema, creates the document, and queues the render — returning 202 with the
 * new document's id while the PDF is produced asynchronously.
 *
 * The Idempotency-Key means a retried request (dropped connection, etc.) is
 * safe: Twill returns the original document instead of billing a second render.
 */
export async function createInvoiceDocument(input: InvoiceInput): Promise<DocumentResponse> {
  const res = await fetch(`${BASE_URL}/v1/documents`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    }),
    body: JSON.stringify({ template: "invoice", input }),
  });

  if (!res.ok) throw new Error(`Failed to create document: ${await readError(res)}`);
  return (await res.json()) as DocumentResponse;
}

async function getDocument(id: number): Promise<DocumentResponse> {
  const res = await fetch(`${BASE_URL}/v1/documents/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch document ${id}: ${await readError(res)}`);
  return (await res.json()) as DocumentResponse;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll until the render finishes. Rendering an invoice is quick, so a short
 * fixed interval with a generous ceiling is plenty for an example.
 */
export async function waitForDocument(
  id: number,
  { intervalMs = 1000, timeoutMs = 60_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<DocumentResponse> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const doc = await getDocument(id);
    if (doc.status === "succeeded") return doc;
    if (doc.status === "failed") {
      throw new Error(`Render failed for document ${id}: ${doc.error ?? "unknown error"}`);
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for document ${id} to render.`);
}

/** Download the finished PDF bytes. Only valid once the document has succeeded. */
export async function downloadPdf(id: number): Promise<Buffer> {
  const res = await fetch(`${BASE_URL}/v1/documents/${id}/download`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to download document ${id}: ${await readError(res)}`);
  return Buffer.from(await res.arrayBuffer());
}
