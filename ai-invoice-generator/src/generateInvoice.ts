import Anthropic from "@anthropic-ai/sdk";
import { invoiceToolSchema, type InvoiceInput } from "./invoiceSchema.js";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

/**
 * Turn a plain-English billing request into a fully structured invoice.
 *
 * We use tool use (a.k.a. function calling) with `tool_choice` forced to our
 * single tool: instead of asking Claude to "reply with JSON" and hoping, we
 * require it to call `build_invoice`, and the SDK hands us back a typed object
 * in exactly the shape Twill expects.
 */
export async function generateInvoice(request: string): Promise<InvoiceInput> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [
      {
        name: "build_invoice",
        description: "Record the structured fields of an invoice extracted from a billing request.",
        input_schema: invoiceToolSchema as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "build_invoice" },
    system:
      `You convert a natural-language billing request into structured invoice fields.\n` +
      `Today's date is ${today}; use it for any relative dates (e.g. "net 30" => due 30 days after issue).\n` +
      `Never compute totals, subtotals, or tax amounts — only capture line-item quantities and unit prices ` +
      `and the tax rate. If a detail is genuinely missing, choose a sensible default rather than inventing ` +
      `specific facts about the parties.`,
    messages: [{ role: "user", content: request }],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolUse) {
    throw new Error("Model did not return structured invoice data. Raw stop reason: " + message.stop_reason);
  }

  return toolUse.input as InvoiceInput;
}
