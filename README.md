# Twill Docs — Examples

Runnable examples for [Twill Docs](https://www.twilldocs.com), the document
infrastructure layer for AI applications. Each folder is a self-contained
project you can clone, configure, and run.

## Examples

| Example | What it shows | Stack |
| ------- | ------------- | ----- |
| [ai-invoice-generator](./ai-invoice-generator) | Turn a plain-English billing request into a production-ready invoice PDF — Claude extracts the structured data, Twill validates it, does the money math, and renders the document. | TypeScript / Node |
| [webhook-receipt](./webhook-receipt) | Turn a payment webhook into a receipt PDF — structured data in, a real document out. Processor-agnostic, no LLM, one API key. | TypeScript / Node |

_More examples coming — quotes, payslips, and legal documents._

## Getting a Twill Docs API key

Sign up at [twilldocs.com](https://www.twilldocs.com) to get an API key (it
starts with `twdc_`). Each example's README explains exactly which keys it
needs and how to run it.

## License

[MIT](./LICENSE) — use any of these as a starting point for your own integration.
