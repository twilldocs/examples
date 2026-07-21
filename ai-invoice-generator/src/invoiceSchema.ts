/**
 * The invoice `input` shape, defined once.
 *
 * This mirrors Twill Docs' server-side `invoice` template schema exactly, so
 * whatever Claude produces here is accepted by `POST /v1/documents` without a
 * translation layer.
 *
 * The important thing to notice: there are NO `subtotal`, `tax`, or `total`
 * fields. The model is deliberately never asked to do arithmetic — it only
 * identifies the parties, the line items, and the tax *rate*. Twill computes
 * every monetary total server-side from the line items. That's the difference
 * between "an LLM that writes a PDF" (which quietly gets the math wrong) and a
 * document you can actually send to a customer.
 */

export interface InvoiceParty {
  name: string;
  address: string;
  email?: string;
  /** Seller only — VAT / tax registration number. */
  tax_id?: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface InvoiceInput {
  invoice_number: string;
  /** ISO 8601 date, e.g. "2026-07-21". */
  issue_date: string;
  /** ISO 8601 date, on or after issue_date. */
  due_date: string;
  /** 3-letter ISO 4217 code, e.g. "USD". */
  currency: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  line_items: InvoiceLineItem[];
  /** Fraction between 0 and 1, e.g. 0.2 for 20%. Omit if no tax. */
  tax_rate?: number;
  notes?: string;
}

/**
 * JSON Schema handed to Claude as a tool input schema. Forcing the model to
 * "call" this tool guarantees it returns data in exactly this shape rather than
 * free-form prose we'd have to parse.
 */
export const invoiceToolSchema = {
  type: "object",
  properties: {
    invoice_number: {
      type: "string",
      description:
        "Invoice number. If the request doesn't specify one, generate a plausible sequential-looking value like 'INV-1001'.",
    },
    issue_date: {
      type: "string",
      description: "Issue date in YYYY-MM-DD format. Default to today if unspecified.",
    },
    due_date: {
      type: "string",
      description:
        "Payment due date in YYYY-MM-DD format, on or after the issue date. If terms like 'net 30' are given, compute the date from the issue date. Default to net-30 if unspecified.",
    },
    currency: {
      type: "string",
      description: "3-letter ISO 4217 currency code, e.g. 'USD'. Default to 'USD' if unspecified.",
    },
    seller: {
      type: "object",
      description: "The party issuing the invoice (who gets paid).",
      properties: {
        name: { type: "string" },
        address: { type: "string" },
        email: { type: "string" },
        tax_id: { type: "string", description: "VAT / tax registration number, if known." },
      },
      required: ["name", "address"],
    },
    buyer: {
      type: "object",
      description: "The party being billed (who pays).",
      properties: {
        name: { type: "string" },
        address: { type: "string" },
        email: { type: "string" },
      },
      required: ["name", "address"],
    },
    line_items: {
      type: "array",
      minItems: 1,
      description:
        "Billed items. Provide quantity and per-unit price only — do NOT compute line totals, subtotals, tax, or grand totals. Twill computes all monetary totals from these.",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number", description: "Must be greater than 0." },
          unit_price: { type: "number", description: "Price per unit, not the line total. Must be >= 0." },
        },
        required: ["description", "quantity", "unit_price"],
      },
    },
    tax_rate: {
      type: "number",
      description: "Tax rate as a fraction between 0 and 1 (e.g. 0.2 for 20% VAT). Omit entirely if no tax applies.",
    },
    notes: {
      type: "string",
      description: "Optional free-text notes / payment terms to print on the invoice.",
    },
  },
  required: ["invoice_number", "issue_date", "due_date", "currency", "seller", "buyer", "line_items"],
} as const;
