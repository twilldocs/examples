"""Generate a payslip PDF for every employee in a CSV — a payroll run.

For each row: build the payslip input, let Twill compute gross → net, and save
the rendered PDF. Rows are processed concurrently (bounded), one bad row doesn't
sink the run, and re-running is safe thanks to per-payslip idempotency keys.
"""

from __future__ import annotations

import calendar
import csv
import datetime
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from twill import TwillClient, TwillError


def load_env(path: str) -> None:
    """Minimal .env loader — no dependencies."""
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if key and key not in os.environ:
                os.environ[key] = value.strip()


def money(value: Any) -> float:
    try:
        return round(float(str(value).strip() or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def current_pay_period() -> tuple[datetime.date, datetime.date]:
    today = datetime.date.today()
    start = today.replace(day=1)
    end = today.replace(day=calendar.monthrange(today.year, today.month)[1])
    return start, end


def build_payslip(row: dict[str, str], period: tuple[datetime.date, datetime.date], employer: dict[str, Any]) -> dict[str, Any]:
    start, end = period
    name = (row.get("employee_name") or "").strip()
    emp_id = (row.get("employee_id") or "").strip()

    # Earnings and deductions are flat amounts; Twill sums them and computes net
    # pay server-side — you never send a gross or net total.
    earnings = [{"description": "Base pay", "amount": money(row.get("base_pay"))}]
    if money(row.get("bonus")) > 0:
        earnings.append({"description": "Bonus", "amount": money(row.get("bonus"))})

    deductions: list[dict[str, Any]] = []
    if money(row.get("tax")) > 0:
        deductions.append({"description": "Income tax", "amount": money(row.get("tax"))})
    if money(row.get("pension")) > 0:
        deductions.append({"description": "Pension contribution", "amount": money(row.get("pension"))})

    return {
        "payslip_number": f"PS-{start:%Y%m}-{emp_id or name.replace(' ', '')}",
        "pay_period_start": start.isoformat(),
        "pay_period_end": end.isoformat(),
        "currency": os.environ.get("PAYROLL_CURRENCY", "USD"),
        "employee": {
            "name": name,
            "id": emp_id or None,
            "position": (row.get("position") or "").strip() or None,
        },
        "employer": employer,
        "earnings": earnings,
        "deductions": deductions,
    }


def process_row(client: TwillClient, row: dict[str, str], period: tuple[datetime.date, datetime.date], employer: dict[str, Any], out_dir: str) -> dict[str, Any]:
    payslip = build_payslip(row, period, employer)
    # payslip_number is stable per employee per period → safe to re-run.
    created = client.create_document("payslip", payslip, idempotency_key=f"payslip:{payslip['payslip_number']}")
    doc_id = int(created["id"])
    client.wait_for_document(doc_id)
    pdf = client.download_pdf(doc_id)

    out_path = os.path.join(out_dir, f"{payslip['payslip_number']}.pdf")
    with open(out_path, "wb") as fh:
        fh.write(pdf)
    return {"employee": payslip["employee"]["name"], "document_id": doc_id, "path": out_path}


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    load_env(os.path.join(here, ".env"))

    api_key = os.environ.get("TWILL_API_KEY", "")
    if not api_key:
        print("TWILL_API_KEY is not set. Copy .env.example to .env and fill it in.", file=sys.stderr)
        return 1

    client = TwillClient(api_key)
    employer = {
        "name": os.environ.get("EMPLOYER_NAME", "Your Company"),
        "address": os.environ.get("EMPLOYER_ADDRESS", "—"),
        "email": os.environ.get("EMPLOYER_EMAIL") or None,
    }

    csv_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "employees.csv")
    with open(csv_path, newline="", encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if (r.get("employee_name") or "").strip()]

    if not rows:
        print(f"No employees found in {csv_path}.", file=sys.stderr)
        return 1

    out_dir = os.path.join(here, "out")
    os.makedirs(out_dir, exist_ok=True)
    period = current_pay_period()

    print(f"▶  Running payroll for {len(rows)} employees ({period[0]:%b %Y})…\n")

    successes: list[dict[str, Any]] = []
    failures: list[tuple[str, str]] = []

    # Bounded concurrency — fast, but gentle on the API's per-tenant rate limit.
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(process_row, client, row, period, employer, out_dir): row for row in rows}
        for future in as_completed(futures):
            row = futures[future]
            name = (row.get("employee_name") or "?").strip()
            try:
                result = future.result()
                successes.append(result)
                print(f"  ✅ {result['employee']:<22} → {os.path.relpath(result['path'], here)}")
            except Exception as exc:  # one bad row must not sink the whole run
                failures.append((name, str(exc)))
                print(f"  ❌ {name:<22} → {exc}")

    print(f"\nDone: {len(successes)} generated, {len(failures)} failed.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
