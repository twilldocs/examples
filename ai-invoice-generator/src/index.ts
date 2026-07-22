import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TwillDocs } from "@twilldocs/sdk";
import { generateInvoice } from "./generateInvoice.js";

const DEFAULT_REQUEST =
  "Bill Acme Corp (500 Market St, San Francisco) for 3 days of consulting at " +
  "$1,200/day plus $340 in travel expenses. From Northwind Studio. Net 30, add 8.5% tax.";

async function main() {
  // Prompt comes from the command line, or falls back to the demo request.
  const request = process.argv.slice(2).join(" ").trim() || DEFAULT_REQUEST;

  console.log("📝 Request:\n   " + request + "\n");

  // 1. Claude extracts structured invoice data — no arithmetic, just the facts.
  console.log("🤖 Extracting structured invoice data with Claude…");
  const invoice = await generateInvoice(request);
  console.log(JSON.stringify(invoice, null, 2) + "\n");

  // 2. Hand the structured data to Twill via the official SDK. `generate`
  //    creates the document, waits for the render, and Twill does the money
  //    math — one call instead of create + poll + download plumbing.
  console.log("📤 Sending to Twill Docs…");
  const twill = new TwillDocs({
    apiKey: process.env.TWILL_API_KEY!,
    baseUrl: process.env.TWILL_BASE_URL,
  });
  const doc = await twill.documents.generate("invoice", invoice);
  console.log(`   Document #${doc.id} rendered ✅`);

  // 3. Download the finished PDF.
  const pdf = await twill.documents.download(doc.id);
  const outDir = join(process.cwd(), "out");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `invoice-${doc.id}.pdf`);
  await writeFile(outPath, pdf);

  console.log(`\n🎉 Done — invoice saved to ${outPath} (${(pdf.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error("\n💥 " + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
