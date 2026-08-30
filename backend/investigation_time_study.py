"""
Investigation-time study — Phase 6 impact deliverable.

Measures Garuda-assisted *system response time* for 5 realistic investigation
tasks (see docs/INVESTIGATION_TIME_STUDY.md for the full protocol and the manual
side of the comparison). This script only automates and times the Garuda
side, over real HTTP calls against a running backend — it does NOT
fabricate manual-baseline numbers. Manual timings must come from an actual
timed session with real participants using a spreadsheet/CSV export, entered
into manual_baseline_minutes.json (see the template written on first run).

Run from backend/ with the server already running (e.g. `python main.py`):
  python investigation_time_study.py --base-url http://localhost:8000
"""

import argparse
import json
import time
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
BASELINE_PATH = DATA_DIR / "manual_baseline_minutes.json"
REPORT_PATH = DATA_DIR / "investigation_time_study_report.json"

TASKS = [
    {
        "id": "T1_repeat_offender_cases",
        "description": "Find all cases linked to a specific repeat offender across districts",
        "path": "/api/network/kingpins?limit=1",
    },
    {
        "id": "T2_most_connected_suspect",
        "description": "Identify the most connected suspect in a syndicate",
        "path": "/api/network/communities?limit=5&max_size=30",
    },
    {
        "id": "T3_suspect_connection",
        "description": "Find how two named suspects connect",
        "path": "/api/network/path?source=A-33aba6b94a22&target=A-2d13e48ace87",
    },
    {
        "id": "T4_district_escalation",
        "description": "Identify the district with abnormal case escalation",
        "path": "/api/anomalies",
    },
    {
        "id": "T5_district_comparison",
        "description": "Compare two districts' crime profile",
        "path": "/api/districts/2/summary",
    },
]

REPEATS = 5


def _login(base_url: str, badge: str, password: str) -> str:
    body = json.dumps({"badge": badge, "password": password}).encode("utf-8")
    req = urllib.request.Request(f"{base_url}/api/auth/login", data=body,
                                  headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))["token"]


def _timed_get(base_url: str, path: str, token: str) -> float:
    req = urllib.request.Request(f"{base_url}{path}", headers={"Authorization": f"Bearer {token}"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=30) as resp:
        resp.read()
    return time.perf_counter() - t0


def _ensure_baseline_template() -> dict:
    if BASELINE_PATH.exists():
        return json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    template = {
        "instructions": (
            "Fill in manual_minutes for each task after a real timed session (see "
            "docs/INVESTIGATION_TIME_STUDY.md). Use the median across at least 3 participants. "
            "Leave null until you have real numbers — do not guess."
        ),
        "participants": None,
        "tasks": {t["id"]: {"description": t["description"], "manual_minutes": None} for t in TASKS},
    }
    BASELINE_PATH.write_text(json.dumps(template, indent=2), encoding="utf-8")
    return template


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--badge", default="KSP-DGP-0001")
    parser.add_argument("--password", default="dgp2026")
    args = parser.parse_args()

    baseline = _ensure_baseline_template()
    token = _login(args.base_url, args.badge, args.password)

    results = []
    for task in TASKS:
        samples = [_timed_get(args.base_url, task["path"], token) for _ in range(REPEATS)]
        avg_seconds = sum(samples) / len(samples)
        manual_minutes = baseline["tasks"].get(task["id"], {}).get("manual_minutes")
        reduction_percent = None
        if manual_minutes:
            garuda_minutes = avg_seconds / 60
            reduction_percent = round((1 - garuda_minutes / manual_minutes) * 100, 1)
        results.append({
            "id": task["id"],
            "description": task["description"],
            "garuda_avg_response_seconds": round(avg_seconds, 3),
            "manual_baseline_minutes": manual_minutes,
            "estimated_time_reduction_percent": reduction_percent,
        })

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "method": (
            f"Garuda side: {REPEATS} repeats of a real HTTP call per task against a running "
            "backend, averaged. This measures system response time only — not full human "
            "task time (reading, deciding, typing). Manual side: must come from a real timed "
            "session with 3+ participants using a CSV/spreadsheet export, entered in "
            "manual_baseline_minutes.json. Reduction % is null until that file is filled in — "
            "never fabricated."
        ),
        "participants": baseline.get("participants"),
        "tasks": results,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"{'Task':<28}{'Garuda (s)':>12}{'Manual (min)':>14}{'Reduction':>12}")
    for r in results:
        manual = r["manual_baseline_minutes"] if r["manual_baseline_minutes"] is not None else "— (fill in)"
        reduction = f"{r['estimated_time_reduction_percent']}%" if r["estimated_time_reduction_percent"] is not None else "—"
        print(f"{r['id']:<28}{r['garuda_avg_response_seconds']:>12}{str(manual):>14}{reduction:>12}")
    if baseline.get("participants") is None:
        print(f"\nNo manual baseline yet — fill in {BASELINE_PATH} after a real timed session "
              "(see docs/INVESTIGATION_TIME_STUDY.md), then re-run this script.")
    print(f"Full report written to {REPORT_PATH}")


if __name__ == "__main__":
    main()
