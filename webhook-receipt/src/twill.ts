import { randomUUID } from "node:crypto";

const BASE_URL = (process.env.TWILL_BASE_URL ?? "https://www.twilldocs.com").replace(/\/$/, "");
const API_KEY = process.env.TWILL_API_KEY;

type DocumentStatus = "pending" | "processing" | "succeeded" | "failed";

export interface DocumentResponse {
  id: number;
  status: DocumentStatus;
  error?: string | null;
  created_at?: string;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  if (!API_KEY) {
    throw new Error("TWILL_API_KEY is not set. Copy .env.example to .env and fill it in.");
  }
  return { Authorization: `Bearer ${API_KEY}`, Accept: "application/json", ...extra };
}

async function readError(res: Response): Promise<string> {
  const body = await res.text();
  return `${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`;
}

/**
 * Create a document from any Twill template. Returns 202 + the new id while the
 * PDF renders asynchronously.
 *
 * `idempotencyKey` should be stable per logical document — pass the same value
 * on a retried webhook and Twill returns the original document instead of
 * rendering (and billing) a second one.
 */
export async function createDocument(
  template: string,
  input: unknown,
  idempotencyKey: string,
): Promise<DocumentResponse> {
  const res = await fetch(`${BASE_URL}/v1/documents`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }),
    body: JSON.stringify({ template, input }),
  });
  if (!res.ok) throw new Error(`Failed to create document: ${await readError(res)}`);
  return (await res.json()) as DocumentResponse;
}

export async function getDocument(id: number): Promise<DocumentResponse> {
  const res = await fetch(`${BASE_URL}/v1/documents/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch document ${id}: ${await readError(res)}`);
  return (await res.json()) as DocumentResponse;
}

/** Download the finished PDF bytes. Only valid once the document has succeeded. */
export async function downloadPdf(id: number): Promise<Buffer> {
  const res = await fetch(`${BASE_URL}/v1/documents/${id}/download`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to download document ${id}: ${await readError(res)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Convenience for callers that don't already have an idempotency key. */
export const newIdempotencyKey = randomUUID;
