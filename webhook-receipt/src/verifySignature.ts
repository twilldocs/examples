import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify an incoming webhook's HMAC-SHA256 signature.
 *
 * Real payment processors sign each webhook with a shared secret so you can
 * confirm it genuinely came from them (and wasn't forged or replayed). The
 * exact header name and encoding vary by provider — this is the common shape:
 * hex-encoded HMAC-SHA256 of the raw request body, sent in `X-Signature`.
 *
 * The comparison uses `timingSafeEqual` to avoid leaking the expected signature
 * through response-timing differences.
 */
export function isValidSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  // Length check first — timingSafeEqual throws if the buffers differ in length.
  return a.length === b.length && timingSafeEqual(a, b);
}
