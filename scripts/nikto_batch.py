#!/usr/bin/env python3
"""
nikto_batch.py - Batch Nikto orchestrator for multi-client web assessments.

What it does:
  1. Reads a list of targets from targets.txt  (format: client_name, https://example.com)
  2. Runs `nikto -h <url> -Format csv -output <per-site.csv>` for each target
  3. Parses every per-site CSV
  4. Aggregates all findings into:
        - nikto_summary.csv  (flat, one row per finding)
        - nikto_summary.xlsx (formatted Excel with sheets: Findings | Per-Site Summary | Stats)
  5. Writes a run log to logs/run_<timestamp>.log

Usage:
  python3 nikto_batch.py                       # scan everything in targets.txt
  python3 nikto_batch.py --targets foo.txt     # custom targets file
  python3 nikto_batch.py --timeout 600         # per-target nikto timeout (sec)
  python3 nikto_batch.py --tuning 1,2,3        # nikto -Tuning flags (see nikto -Help)
  python3 nikto_batch.py --dry-run             # show what would be scanned, don't run
  python3 nikto_batch.py --nikto-path /opt/nikto/nikto.pl   # custom path

Author: your security toolkit
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# ---------- output dirs (always next to this script) ----------
BASE_DIR    = Path(__file__).resolve().parent
OUTPUT_DIR  = BASE_DIR.parent / "download" / "nikto_runs"
RAW_DIR     = OUTPUT_DIR / "raw"        # per-site nikto CSV
LOG_DIR     = OUTPUT_DIR / "logs"
TARGETS_FILE = BASE_DIR / "targets.txt"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
RAW_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------- #
#  Target parsing
# ---------------------------------------------------------------- #
TARGET_LINE_RE = re.compile(
    r"""^
        \s*
        (?P<client>[^,]+?)              # client name (lazy, up to first comma)
        \s*,\s*
        (?P<url>https?://[^\s,]+)       # url
        (?:\s*,\s*(?P<note>.+?))?       # optional note
        \s*$
    """,
    re.VERBOSE,
)


def load_targets(path: Path) -> list[dict]:
    """Parse targets file. Format:  client_name, https://site.tld [, note]"""
    if not path.exists():
        sys.exit(f"[!] targets file not found: {path}")

    targets: list[dict] = []
    for ln, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = TARGET_LINE_RE.match(line)
        if not m:
            print(f"[!] line {ln}: cannot parse -> {raw!r}", file=sys.stderr)
            continue
        targets.append({
            "client": m.group("client").strip(),
            "url":    m.group("url").strip(),
            "note":   (m.group("note") or "").strip(),
        })

    if not targets:
        sys.exit(f"[!] no valid targets found in {path}")

    return targets


# ---------------------------------------------------------------- #
#  Nikto runner
# ---------------------------------------------------------------- #
def find_nikto(explicit: str | None) -> str:
    if explicit:
        p = Path(explicit)
        if not p.exists():
            sys.exit(f"[!] --nikto-path not found: {p}")
        return str(p)
    found = shutil.which("nikto") or shutil.which("nikto.pl")
    if not found:
        sys.exit(
            "[!] nikto not found on PATH.\n"
            "    Install it (e.g. `apt install nikto` or download from official source)\n"
            "    or pass --nikto-path /opt/nikto/nikto.pl"
        )
    return found


def run_nikto(nikto: str, target: dict, timeout: int, tuning: str | None,
              extra_args: list[str]) -> dict:
    """Run nikto against one target. Returns a result dict."""
    client = target["client"]
    url    = target["url"]
    safe   = re.sub(r"[^A-Za-z0-9._-]+", "_", f"{client}_{url}")[:120]
    ts     = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    csv_out = RAW_DIR / f"{safe}__{ts}.csv"

    cmd = [
        nikto,
        "-h", url,
        "-Format", "csv",
        "-output", str(csv_out),
        "-ask", "no",          # auto-answer "no" to submission prompts
        "-nointeractive",
    ]
    if tuning:
        cmd += ["-Tuning", tuning]

    cmd += extra_args

    started = time.time()
    proc = subprocess.run(
        cmd,
        timeout=timeout,
        capture_output=True,
        text=True,
        shell=False,
    )
    elapsed = time.time() - started

    return {
        "target": target,
        "cmd": cmd,
        "csv_out": csv_out,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "rc": proc.returncode,
        "elapsed": round(elapsed, 1),
    }


# ---------------------------------------------------------------- #
#  Per-site CSV parser
# ---------------------------------------------------------------- #
# Nikto CSV columns can vary, but commonly:
#   "Server","IP","Port","URI","HTTP Method","Vulnerability ID","Description","Reference"
NIKTO_FIELDS = [
    "Server", "IP", "Port", "URI", "HTTP Method",
    "Vulnerability ID", "Description", "Reference",
]


def parse_nikto_csv(csv_path: Path) -> list[dict]:
    """Parse a single nikto CSV output. Returns list of finding dicts."""
    if not csv_path.exists() or csv_path.stat().st_size == 0:
        return []

    # Some nikto versions prepend banner lines; find first CSV header row.
    with csv_path.open("r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    start_idx = 0
    for i, ln in enumerate(lines):
        if ln.lower().startswith("server,"):
            start_idx = i
            break

    findings: list[dict] = []
    try:
        rdr = csv.DictReader(lines[start_idx:])
        for row in rdr:
            findings.append({k: (row.get(k) or "").strip() for k in NIKTO_FIELDS})
    except Exception as e:
        print(f"[!] failed to parse {csv_path.name}: {e}", file=sys.stderr)
    return findings


# ---------------------------------------------------------------- #
#  Aggregators
# ---------------------------------------------------------------- #
def write_summary_csv(rows: list[dict], out: Path) -> None:
    if not rows:
        out.write_text("client,url,scan_time,server,ip,port,uri,method,vuln_id,description,reference\n")
        return
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "client", "url", "scan_time", "server", "ip", "port",
            "uri", "method", "vuln_id", "description", "reference",
        ])
        for r in rows:
            w.writerow([
                r["client"], r["url"], r["scan_time"],
                r["Server"], r["IP"], r["Port"], r["URI"],
                r["HTTP Method"], r["Vulnerability ID"],
                r["Description"], r["Reference"],
            ])


def write_summary_xlsx(rows: list[dict], per_site: list[dict], out: Path) -> None:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()

    # ---- Sheet 1: Findings ----
    ws = wb.active
    ws.title = "Findings"
    headers = ["Client", "URL", "Scan Time (UTC)", "Server", "IP", "Port",
               "URI", "Method", "Vuln ID", "Description", "Reference"]
    ws.append(headers)

    header_fill = PatternFill("solid", fgColor="1E3A8A")
    header_font = Font(color="FFFFFF", bold=True)
    thin = Side(border_style="thin", color="CBD5E1")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    for c, _ in enumerate(headers, 1):
        cell = ws.cell(row=1, column=c)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border

    # severity hint based on keywords in description
    sev_keywords = [
        (r"\bxss\b|cross.?site",        "High",   "FCA5A5"),
        (r"\bsql.?injection\b|sqli",     "High",   "FCA5A5"),
        (r"\brce\b|remote code|command exec", "Critical", "F87171"),
        (r"\bcsrf\b",                   "Medium", "FCD34D"),
        (r"\bdefault (login|credential)", "High", "FCA5A5"),
        (r"\bbackup\b|\.bak|\.old",     "Medium", "FCD34D"),
        (r"\binfo disclosure\b|leak|exposure", "Medium", "FCD34D"),
        (r"\bheaders? missing|outdated|obsolete|deprecated", "Low", "93C5FD"),
    ]

    for r in rows:
        desc = (r["Description"] or "").lower()
        sev, fill_color = "Info", "E2E8F0"
        for pat, s, fc in sev_keywords:
            if re.search(pat, desc):
                sev, fill_color = s, fc
                break

        ws.append([
            r["client"], r["url"], r["scan_time"],
            r["Server"], r["IP"], r["Port"], r["URI"],
            r["HTTP Method"], r["Vuln ID"], r["Description"], r["Reference"],
        ])
        # add Severity column (we re-append in column 12)
        last_row = ws.max_row
        ws.cell(row=last_row, column=12, value=sev).fill = PatternFill(
            "solid", fgColor=fill_color
        )

    # add Severity header
    sev_cell = ws.cell(row=1, column=12, value="Severity (auto)")
    sev_cell.fill = header_fill
    sev_cell.font = header_font
    sev_cell.alignment = Alignment(horizontal="center", vertical="center")

    # auto-size
    widths = [18, 32, 22, 22, 14, 8, 28, 10, 14, 70, 32, 16]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    # ---- Sheet 2: Per-Site Summary ----
    ws2 = wb.create_sheet("Per-Site Summary")
    ws2.append(["Client", "URL", "Findings Count", "Critical", "High",
                "Medium", "Low", "Info", "Scan Status", "Elapsed (s)"])
    for c in range(1, 11):
        cell = ws2.cell(row=1, column=c)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")
        cell.border = border

    for s in per_site:
        ws2.append([
            s["client"], s["url"], s["count"],
            s["critical"], s["high"], s["medium"], s["low"], s["info"],
            s["status"], s["elapsed"],
        ])

    widths2 = [18, 32, 14, 10, 10, 10, 10, 10, 14, 12]
    for i, w in enumerate(widths2, 1):
        ws2.column_dimensions[get_column_letter(i)].width = w
    ws2.freeze_panes = "A2"
    ws2.auto_filter.ref = ws2.dimensions

    # ---- Sheet 3: Stats ----
    ws3 = wb.create_sheet("Stats")
    total = len(rows)
    crit = sum(1 for r in per_site for _ in [r["critical"]] if r["critical"])
    high = sum(r["high"] for r in per_site)
    med  = sum(r["medium"] for r in per_site)
    low  = sum(r["low"] for r in per_site)
    info = sum(r["info"] for r in per_site)

    ws3.append(["Metric", "Value"])
    for c in range(1, 3):
        cell = ws3.cell(row=1, column=c)
        cell.fill = header_fill
        cell.font = header_font

    ws3.append(["Targets scanned",         len(per_site)])
    ws3.append(["Total findings",          total])
    ws3.append(["Critical findings",       crit])
    ws3.append(["High findings",           high])
    ws3.append(["Medium findings",         med])
    ws3.append(["Low findings",            low])
    ws3.append(["Info findings",           info])
    ws3.append(["Scan run (UTC)", datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")])

    ws3.column_dimensions["A"].width = 28
    ws3.column_dimensions["B"].width = 18

    wb.save(out)


# ---------------------------------------------------------------- #
#  Severity counting helper
# ---------------------------------------------------------------- #
def classify_severity(description: str) -> str:
    d = (description or "").lower()
    if re.search(r"\brce\b|remote code|command exec", d):
        return "critical"
    if re.search(r"\bxss\b|cross.?site|sql.?injection|sqli|default (login|credential)", d):
        return "high"
    if re.search(r"\bcsrf\b|backup\b|\.bak|\.old|info disclosure|leak|exposure", d):
        return "medium"
    if re.search(r"\bheaders? missing|outdated|obsolete|deprecated", d):
        return "low"
    return "info"


# ---------------------------------------------------------------- #
#  Main
# ---------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(description="Batch nikto scanner.")
    ap.add_argument("--targets",   type=Path, default=TARGETS_FILE,
                    help=f"Targets file (default: {TARGETS_FILE})")
    ap.add_argument("--timeout",   type=int, default=900,
                    help="Per-target nikto timeout in seconds (default 900)")
    ap.add_argument("--tuning",    type=str, default=None,
                    help="Nikto -Tuning flags (e.g. '1,2,3')")
    ap.add_argument("--nikto-path", type=str, default=None,
                    help="Override path to nikto binary")
    ap.add_argument("--dry-run",   action="store_true",
                    help="List targets, don't scan")
    ap.add_argument("--only",      type=str, default=None,
                    help="Comma-separated substrings to filter client names")
    ap.add_argument("rest", nargs=argparse.REMAINDER,
                    help="Extra args forwarded to nikto (after -- )")
    args = ap.parse_args()

    nikto = find_nikto(args.nikto_path)
    targets = load_targets(args.targets)

    if args.only:
        wanted = {s.strip().lower() for s in args.only.split(",") if s.strip()}
        targets = [t for t in targets if t["client"].lower() in wanted]

    print(f"[*] nikto binary : {nikto}")
    print(f"[*] targets file : {args.targets}")
    print(f"[*] targets count: {len(targets)}")
    if args.tuning:
        print(f"[*] nikto tuning: {args.tuning}")
    if args.dry_run:
        for t in targets:
            print(f"    - {t['client']:20s}  {t['url']}")
        return 0

    ts_run = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"run_{ts_run}.log"
    log_fp = log_path.open("w", encoding="utf-8")

    def log(msg: str) -> None:
        print(msg)
        log_fp.write(msg + "\n")
        log_fp.flush()

    log(f"=== nikto batch run {ts_run} ===")
    log(f"targets: {len(targets)}")

    all_rows: list[dict] = []
    per_site: list[dict] = []

    for i, t in enumerate(targets, 1):
        log(f"\n[{i}/{len(targets)}] {t['client']}  ->  {t['url']}")
        try:
            res = run_nikto(nikto, t, args.timeout, args.tuning, args.rest)
            log(f"    rc={res['rc']}  elapsed={res['elapsed']}s  csv={res['csv_out'].name}")

            if res["stderr"].strip():
                # don't dump full stderr, just last 4 lines
                tail = "\n      ".join(res["stderr"].splitlines()[-4:])
                log(f"    stderr tail:\n      {tail}")

            findings = parse_nikto_csv(res["csv_out"])
            log(f"    findings: {len(findings)}")

            scan_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            for f in findings:
                f["client"] = t["client"]
                f["url"] = t["url"]
                f["scan_time"] = scan_time
                all_rows.append(f)

            # severity counts
            sev_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
            for f in findings:
                sev_counts[classify_severity(f.get("Description", ""))] += 1

            per_site.append({
                "client": t["client"],
                "url": t["url"],
                "count": len(findings),
                "critical": sev_counts["critical"],
                "high": sev_counts["high"],
                "medium": sev_counts["medium"],
                "low": sev_counts["low"],
                "info": sev_counts["info"],
                "status": "ok" if res["rc"] == 0 else f"rc={res['rc']}",
                "elapsed": res["elapsed"],
            })

        except subprocess.TimeoutExpired:
            log(f"    [!] TIMEOUT after {args.timeout}s")
            per_site.append({
                "client": t["client"], "url": t["url"], "count": 0,
                "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0,
                "status": "timeout", "elapsed": args.timeout,
            })
        except Exception as e:
            log(f"    [!] ERROR: {e}")
            per_site.append({
                "client": t["client"], "url": t["url"], "count": 0,
                "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0,
                "status": f"error: {e}", "elapsed": 0,
            })

    # write aggregates
    csv_summary  = OUTPUT_DIR / f"nikto_summary_{ts_run}.csv"
    xlsx_summary = OUTPUT_DIR / f"nikto_summary_{ts_run}.xlsx"

    write_summary_csv(all_rows, csv_summary)
    write_summary_xlsx(all_rows, per_site, xlsx_summary)

    # also overwrite "latest" symlinks/files
    latest_csv  = OUTPUT_DIR / "nikto_summary_latest.csv"
    latest_xlsx = OUTPUT_DIR / "nikto_summary_latest.xlsx"
    if latest_csv.exists():
        latest_csv.unlink()
    if latest_xlsx.exists():
        latest_xlsx.unlink()
    shutil.copy2(csv_summary, latest_csv)
    shutil.copy2(xlsx_summary, latest_xlsx)

    log(f"\n=== DONE ===")
    log(f"raw CSVs       : {RAW_DIR}")
    log(f"summary CSV    : {csv_summary}")
    log(f"summary XLSX    : {xlsx_summary}")
    log(f"latest CSV      : {latest_csv}")
    log(f"latest XLSX      : {latest_xlsx}")
    log(f"run log         : {log_path}")

    log_fp.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
