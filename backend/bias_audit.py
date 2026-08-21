"""
Cross-district bias/fairness audit for the risk classifier and anomaly
detector — Phase 6 responsible-AI deliverable.

Computes, over the full live dataset (vectorized, not per-case API calls):
  - risk-classifier "high" flag rate per district, normalized by case volume
  - anomaly-detector flag rate per district, normalized by station count
  - a disproportionate-flagging check: any district whose flag rate deviates
    more than DEVIATION_THRESHOLD from the statewide average is reported
    with the ratio, for human review — this script surfaces deviations, it
    does not explain them.

No demographic attributes (age/gender) are used as model inputs anywhere in
this pipeline — _risk_features()/_local_risk_prediction() in main.py only
ever read gravity, accused/arrest counts, and volume features. This script
only aggregates by district/station (operational/geographic groupings, not
demographic ones).

Run from backend/: python bias_audit.py
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

import main as garuda
from karnataka_districts import DISTRICTS

REPORT_PATH = Path(__file__).parent / "data" / "bias_audit_report.json"
DEVIATION_THRESHOLD = 1.3  # flag districts whose rate is >1.3x or <1/1.3x the statewide average


def _vectorized_local_risk(cases: pd.DataFrame, accused: pd.DataFrame, arrests: pd.DataFrame) -> pd.Series:
    """Reimplements _local_risk_prediction()'s scoring formula as a vectorized
    pandas computation — the per-case API path is O(n) per call and would take
    far too long over 124k+ cases. Kept in exact numeric lockstep with main.py
    so this audit reflects the real deployed classifier, not an approximation."""
    accused_counts = accused.groupby("CaseMasterID").size()
    arrest_counts = arrests.groupby("CaseMasterID").size()

    normalized_names = accused["AccusedName"].astype(str).str.strip().str.casefold()
    identity_counts = normalized_names.value_counts()
    repeat_flag = normalized_names.map(identity_counts).gt(1)
    repeat_accused_count = accused.assign(_repeat=repeat_flag).groupby("CaseMasterID")["_repeat"].sum()

    case_ids = cases["CaseMasterID"].astype(int)
    gravity = cases["GravityOffenceID"].astype(int).to_numpy()
    acc_count = case_ids.map(accused_counts).fillna(0).to_numpy()
    rpt_count = case_ids.map(repeat_accused_count).fillna(0).to_numpy()
    arr_count = case_ids.map(arrest_counts).fillna(0).to_numpy()
    arrest_rate = np.minimum(100.0, arr_count / np.maximum(acc_count, 1) * 100.0)

    score = (
        gravity * 3.0
        + np.minimum(acc_count, 4) * 0.8
        + np.minimum(rpt_count, 4) * 1.3
        - np.minimum(arrest_rate, 100.0) * 0.006
    )
    risk_class = np.where(score >= 14, "high", np.where(score >= 10, "medium", "low"))
    return pd.Series(risk_class, index=cases.index)


def _flag_ratio_note(rate: float, overall: float) -> str | None:
    if overall <= 0:
        return None
    ratio = rate / overall
    if ratio >= DEVIATION_THRESHOLD:
        return f"{ratio:.2f}x the statewide average (over-flagged) \u2014 review recommended"
    if ratio <= 1 / DEVIATION_THRESHOLD:
        return f"{ratio:.2f}x the statewide average (under-flagged) \u2014 review recommended"
    return None


def main() -> None:
    garuda.load_from_csv()
    cases, accused, arrests = garuda.DB.cases, garuda.DB.accused, garuda.DB.arrests
    cases = cases.copy()
    cases["RiskClass"] = _vectorized_local_risk(cases, accused, arrests)

    overall_high_rate = float((cases["RiskClass"] == "high").mean())
    anomalies = garuda._compute_anomalies()
    anomaly_stations = {a["station_id"] for a in anomalies}

    rows = []
    for d in DISTRICTS:
        district_cases = cases[cases["DistrictID"] == d.district_id]
        total = len(district_cases)
        if total == 0:
            continue
        high_rate = float((district_cases["RiskClass"] == "high").mean())
        station_ids = list(range(d.station_start, d.station_end + 1))
        anomaly_rate = len([s for s in station_ids if s in anomaly_stations]) / len(station_ids)
        rows.append({
            "district_id": d.district_id,
            "name": d.name,
            "total_cases": total,
            "high_risk_flag_rate_percent": round(high_rate * 100, 2),
            "flag_rate_note": _flag_ratio_note(high_rate, overall_high_rate),
            "anomaly_station_rate_percent": round(anomaly_rate * 100, 2),
        })

    report = {
        "generated_at": pd.Timestamp.now().isoformat(),
        "total_cases": len(cases),
        "overall_high_risk_flag_rate_percent": round(overall_high_rate * 100, 2),
        "deviation_threshold": DEVIATION_THRESHOLD,
        "demographic_attributes_used": [],
        "methodology": (
            "Vectorized reimplementation of _local_risk_prediction() applied to every case, "
            "grouped by district (via the PoliceStationID -> DistrictID mapping already "
            "assigned at load time). Flags districts whose high-risk rate deviates more than "
            "the threshold from the statewide average. This is a distributional check, not a "
            "causal explanation \u2014 a flagged deviation means 'review this district's data and "
            "context,' not 'the model is wrong here.'"
        ),
        "by_district": rows,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"Statewide high-risk flag rate: {report['overall_high_risk_flag_rate_percent']}% ({len(cases)} cases)")
    print(f"{'District':<20}{'Cases':>10}{'High-risk %':>14}{'Anomaly stations %':>20}  Note")
    for r in rows:
        note = r["flag_rate_note"] or ""
        print(f"{r['name']:<20}{r['total_cases']:>10}{r['high_risk_flag_rate_percent']:>14}{r['anomaly_station_rate_percent']:>20}  {note}")
    print(f"\nFull report written to {REPORT_PATH}")


if __name__ == "__main__":
    main()
