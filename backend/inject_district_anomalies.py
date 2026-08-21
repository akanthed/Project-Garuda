"""Inject a genuine, detectable case-count spike into one station per
non-Bengaluru district — Phase 6 follow-up.

Why: audited (2026-08-21) why every district except Bengaluru Urban showed
"0 active anomalies" / Risk Level 0.0 in the UI. Root cause is NOT a bug in
_compute_anomalies() or the KPI math (Risk Level is, by design, the average
z-score of active anomalies — 0 anomalies necessarily means Risk Level 0.0).
It's a statistical artifact of the synthetic data: generate_statewide_data.py
draws every case date uniformly at random with no seasonal/spike structure,
and Bengaluru Urban has 100 stations vs 8 per new district. With 100
independent "rolls" a month, Bengaluru is likely to have some station cross
the z>=2.0 anomaly threshold by pure chance; with only 8 rolls, most new
districts almost never do — not because they're actually calmer.

This script surgically moves a small, realistic batch of EXISTING cases (not
new synthetic rows — CaseMasterID/AccusedMasterID counts are unchanged) at
one designated station per new district into the final calendar month of the
dataset, so that station's most recent month becomes a genuine, reproducible
statistical outlier vs its own trailing history. Associated ArrestSurrender
rows are shifted by the same day-delta (clamped to END_DATE) so arrest dates
never precede their case's new crime date.

Idempotent: skips if scale_manifest.json already records an injection run
(pass --force to redo). Run from backend/: python inject_district_anomalies.py
"""

import argparse
import json
import random
import shutil
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

from karnataka_districts import DISTRICTS

DATA_DIR = Path(__file__).parent / "data"
END_DATE = datetime(2026, 6, 30)
SPIKE_WINDOW_DAYS = 25       # cases land within the last ~25 days of the dataset
CASES_PER_SPIKE = 18         # comfortably above any station's typical monthly count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=20260821)
    parser.add_argument("--force", action="store_true", help="Re-inject even if already done")
    args = parser.parse_args()

    manifest_path = DATA_DIR / "scale_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    if manifest.get("district_anomaly_injected") and not args.force:
        print("District anomaly spikes already injected; pass --force to redo. Nothing to do.")
        return

    paths = {name: DATA_DIR / f"{name}.csv" for name in ("CaseMaster", "ArrestSurrender")}
    frames = {name: pd.read_csv(path) for name, path in paths.items()}
    cases = frames["CaseMaster"]
    arrests = frames["ArrestSurrender"]

    backup_dir = DATA_DIR / f"backup_{datetime.now().strftime('%Y%m%dT%H%M%S')}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    for name, path in paths.items():
        shutil.copy2(path, backup_dir / path.name)
    print(f"Backed up existing CSVs to {backup_dir}")

    rng = random.Random(args.seed)
    cases["CrimeRegisteredDate"] = pd.to_datetime(cases["CrimeRegisteredDate"])
    arrests["ArrestSurrenderDate"] = pd.to_datetime(arrests["ArrestSurrenderDate"])

    spiked_stations: dict[str, int] = {}
    for district in DISTRICTS:
        if district.district_id == 1:
            continue  # Bengaluru already shows real anomalies; leave untouched
        station_id = rng.randint(district.station_start, district.station_end)
        station_cases = cases[cases["PoliceStationID"] == station_id]
        pick_n = min(CASES_PER_SPIKE, len(station_cases))
        if pick_n == 0:
            continue
        pick_idx = rng.sample(list(station_cases.index), pick_n)

        for idx in pick_idx:
            old_date = cases.at[idx, "CrimeRegisteredDate"]
            new_date = END_DATE - timedelta(days=rng.randint(0, SPIKE_WINDOW_DAYS))
            delta = new_date - old_date
            cases.at[idx, "CrimeRegisteredDate"] = new_date

            case_id = cases.at[idx, "CaseMasterID"]
            linked = arrests[arrests["CaseMasterID"] == case_id]
            for aidx in linked.index:
                shifted = min(arrests.at[aidx, "ArrestSurrenderDate"] + delta, pd.Timestamp(END_DATE))
                arrests.at[aidx, "ArrestSurrenderDate"] = max(shifted, new_date)

        spiked_stations[district.name] = station_id
        print(f"{district.name}: moved {pick_n} cases at station {station_id} into the final month")

    cases["CrimeRegisteredDate"] = cases["CrimeRegisteredDate"].dt.strftime("%Y-%m-%d")
    arrests["ArrestSurrenderDate"] = arrests["ArrestSurrenderDate"].dt.strftime("%Y-%m-%d")
    cases.to_csv(paths["CaseMaster"], index=False)
    arrests.to_csv(paths["ArrestSurrender"], index=False)

    manifest.update({
        "district_anomaly_injected": True,
        "district_anomaly_injected_at": datetime.now().isoformat(timespec="seconds"),
        "district_anomaly_spiked_stations": spiked_stations,
    })
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Done. Spiked {len(spiked_stations)} stations.")


if __name__ == "__main__":
    main()
