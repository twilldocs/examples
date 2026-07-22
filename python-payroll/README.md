# Payroll Run — bulk payslips in Python — Twill Docs

Generate a payslip PDF for **every employee in a CSV** in one command — a
payroll run. Plain Python, no dependencies, one API key.

```
 employees.csv ──▶  Twill Docs  ──▶  out/PS-202607-E-1001.pdf
   (one row per      (validates,        out/PS-202607-E-1002.pdf
    employee)         computes net,     out/PS-202607-E-1003.pdf
                      renders each)      …
```

This is the example that shows Twill at **volume** — the async job queue,
idempotency, and bounded concurrency working together on a real batch. And the
payslip template shows the "Twill does the math" story in a new place: you send
flat **earnings** and **deductions**, and Twill computes gross and net pay
server-side. You never send a total.

## Prerequisites

- Python 3.9+ (standard library only — **no `pip install`**)
- A [Twill Docs API key](https://www.twilldocs.com) (starts with `twdc_`)

## Setup

```bash
cp .env.example .env
# then edit .env: add your twdc_ key and your employer details
```

## Run it

```bash
python run_payroll.py
```

…or point it at your own CSV:

```bash
python run_payroll.py path/to/employees.csv
```

You'll see each payslip complete as it renders, then find the PDFs in `out/`:

```
▶  Running payroll for 4 employees (Jul 2026)…

  ✅ Ada Lovelace          → out/PS-202607-E-1001.pdf
  ✅ Grace Hopper          → out/PS-202607-E-1003.pdf
  ✅ Alan Turing           → out/PS-202607-E-1002.pdf
  ✅ Katherine Johnson     → out/PS-202607-E-1004.pdf

Done: 4 generated, 0 failed.
```

## The CSV

One row per employee. Amounts are flat figures for the pay period:

| Column | Meaning |
| ------ | ------- |
| `employee_name` | Required. |
| `employee_id` | Optional. Used in the payslip number and filename. |
| `position` | Optional job title. |
| `base_pay` | Base earnings for the period. |
| `bonus` | Added as a second earnings line if greater than 0. |
| `tax` | Deduction, if greater than 0. |
| `pension` | Deduction, if greater than 0. |

## How it works

| File | Role |
| ---- | ---- |
| [`run_payroll.py`](run_payroll.py) | Reads the CSV, builds each payslip, runs the batch, saves the PDFs. |
| [`twill.py`](twill.py) | A tiny stdlib-only Twill client: `create_document()`, `wait_for_document()`, `download_pdf()`. |

### What this example gets right at batch scale

- **Bounded concurrency.** Rows are processed in a small thread pool
  (`max_workers=4`) — fast, but gentle on Twill's per-tenant rate limit. Turn it
  up or down to trade throughput against your plan's limits.
- **Partial failure is survivable.** One employee's bad data or a transient
  error doesn't sink the run — it's recorded, the rest continue, and the process
  exits non-zero if anything failed so a scheduler can alert.
- **Re-running is safe.** Each payslip's number (`PS-<period>-<employee>`) is its
  idempotency key, so re-running the same payroll reuses the existing PDFs
  instead of generating duplicates.

### You send amounts, not totals

Look at `build_payslip()` — there's no gross, no net, no "total deductions". You
provide earnings and deductions as flat lines; **Twill's payslip calculator**
computes gross pay, total deductions, and net pay. That's payroll math you don't
have to own or test.

## Adapting this to your app

- **Your data source.** Swap the CSV read for a query against your HR/payroll
  database — the batch loop doesn't change.
- **Other document types.** The same batch pattern renders invoices, receipts,
  or statements in bulk — swap `template` and the row-to-input mapping.
- **Scheduling.** Run it from cron / a scheduled job at period end; the
  non-zero exit on failure makes it safe to alert on.
- **Branding.** Set your logo and colours once via Twill's `/v1/brand` endpoint
  and every payslip picks them up.

## License

MIT — use it as a starting point for your own integration.
