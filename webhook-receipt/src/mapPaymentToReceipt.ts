/**
 * Map a generic payment webhook into Twill's `receipt` template input.
 *
 * This is deliberately processor-agnostic — it's a plain shape you'd populate
 * from Stripe, Paddle, Braintree, your own billing system, or a test `curl`.
 * Adapt the field names in `PaymentEvent` to whatever your processor sends;
 * the mapping below is the only thing Twill cares about.
 */

import type { ReceiptInput } from "@twilldocs/sdk";

/** The generic incoming webhook body this example understands. */
export interface PaymentEvent {
  /** e.g. "payment.succeeded" — we only act on successful payments. */
  event: string;
  payment: {
    /** Processor's payment id — used to derive a stable receipt number. */
    id: string;
    /** ISO 8601 timestamp of when the payment completed. */
    created_at?: string;
    /** 3-letter ISO 4217 currency code, e.g. "USD". */
    currency: string;
    /** How they paid, e.g. "card", "bank_transfer". Printed on the receipt. */
    method?: string;
    customer: {
      name: string;
      email?: string;
      address?: string;
    };
    /**
     * Billed items. Amounts are in the currency's MINOR units (e.g. cents) —
     * the near-universal convention for payment processors. We convert to major
     * units below, since that's what a human-readable receipt shows.
     */
    line_items: Array<{
      description: string;
      quantity: number;
      /** Per-unit price in minor units (e.g. 4200 = $42.00). */
      unit_amount: number;
    }>;
  };
}

/**
 * Minor units → major units. Assumes a 2-decimal currency (USD, EUR, GBP, …),
 * which covers the vast majority. Zero-decimal currencies (JPY, KRW) or
 * 3-decimal ones (BHD, KWD) would need a per-currency exponent — out of scope
 * for this example, but worth knowing if you handle them.
 */
function toMajorUnits(minor: number): number {
  return minor / 100;
}

/** Your business identity, read once from config — never from the webhook. */
export interface Merchant {
  name: string;
  address: string;
  email?: string;
  tax_id?: string;
}

export function mapPaymentToReceipt(event: PaymentEvent, merchant: Merchant): ReceiptInput {
  const { payment } = event;

  return {
    // A receipt number that's stable per payment — so a retried webhook maps to
    // the same logical receipt (see the idempotency note in the README).
    receipt_number: `RCPT-${payment.id}`,
    issue_date: (payment.created_at ?? new Date().toISOString()).slice(0, 10),
    currency: payment.currency,
    payment_method: payment.method,

    // Seller = you. Buyer = the paying customer from the webhook.
    seller: {
      name: merchant.name,
      address: merchant.address,
      email: merchant.email,
      tax_id: merchant.tax_id || undefined,
    },
    buyer: {
      name: payment.customer.name,
      // Twill requires a buyer address; fall back to a placeholder if the
      // processor didn't send one (many don't for card payments).
      address: payment.customer.address ?? "—",
      email: payment.customer.email,
    },

    // Twill computes subtotal/total from these — we only supply quantities and
    // per-unit prices, converted from minor units.
    line_items: payment.line_items.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unit_price: toMajorUnits(li.unit_amount),
    })),
  };
}
