"""Additively generate statewide (non-Bengaluru) synthetic cases/accused/arrests.

Mirrors scale_data.py's append pattern exactly (same schema, same accused/arrest
generation logic and weights) but samples PoliceStationID/coordinates from each
new Karnataka district's own reserved station range and bounding box (see
karnataka_districts.py) instead of the Bengaluru-only pool. Existing rows
(CaseMasterID 1..100000, PoliceStationID 1-100) are never modified.

Run from backend/: python generate_statewide_data.py --per-district-cases 3000

Idempotent: skips generation if CaseMaster already contains a PoliceStationID
outside the Bengaluru Urban range (i.e. this script already ran once).
"""

import argparse
import json
import shutil
from datetime import datetime, timedelta
from pathlib import Path
import random

import pandas as pd
from faker import Faker

from karnataka_districts import DISTRICTS

DATA_DIR = Path(__file__).parent / "data"
END_DATE = datetime(2026, 6, 30)
START_DATE = datetime(2022, 1, 1)


def random_date(rng: random.Random) -> datetime:
    seconds = int((END_DATE - START_DATE).total_seconds())
    return START_DATE + timedelta(seconds=rng.randint(0, seconds))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-district-cases", type=int, default=3000)
    parser.add_argument("--seed", type=int, default=20260820)
    parser.add_argument("--force", action="store_true", help="Regenerate even if statewide data already exists")
    args = parser.parse_args()

    paths = {name: DATA_DIR / f"{name}.csv" for name in ("CaseMaster", "Accused", "ArrestSurrender", "CrimeHead")}
    frames = {name: pd.read_csv(path) for name, path in paths.items()}
    cases = frames["CaseMaster"]
    original_rows = {name: len(frame) for name, frame in frames.items()}

    new_districts = [d for d in DISTRICTS if d.district_id != 1]  # skip Bengaluru Urban (already exists)
    first_new_station_id = min(d.station_start for d in new_districts)

    if not args.force and (cases["PoliceStationID"] >= first_new_station_id).any():
        print("Statewide data already present (found PoliceStationID >= "
              f"{first_new_station_id}); pass --force to regenerate. Nothing to do.")
        return

    backup_dir = DATA_DIR / f"backup_{datetime.now().strftime('%Y%m%dT%H%M%S')}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    for name, path in paths.items():
        shutil.copy2(path, backup_dir / path.name)
    print(f"Backed up existing CSVs to {backup_dir}")

    rng = random.Random(args.seed)
    fake = Faker("en_IN")
    fake.seed_instance(args.seed)
    crime_heads = frames["CrimeHead"].to_dict(orient="records")
    crime_weights = [1 / (float(item["GravityLevel"]) * 0.5 + 1) for item in crime_heads]

    next_case_id = int(cases["CaseMasterID"].max()) + 1
    next_accused_id = int(frames["Accused"]["AccusedMasterID"].max()) + 1
    next_arrest_id = int(frames["ArrestSurrender"]["ArrestSurrenderID"].max()) + 1

    case_rows: list[dict] = []
    accused_rows: list[dict] = []
    arrest_rows: list[dict] = []
    # Fresh per-district repeat-offender pools so syndicate links stay within
    # a district's own case set (a repeat name should not jump districts).
    repeat_names: list[dict] = frames["Accused"].drop_duplicates("AccusedName").tail(500)[
        ["AccusedName", "AgeYear", "GenderID"]].to_dict(orient="records")

    district_case_counts: dict[str, int] = {}

    for district in new_districts:
        min_lat, max_lat, min_lng, max_lng = district.bounds
        district_repeat_pool = list(repeat_names)  # seed with existing global names for cross-district syndicate leads
        for _ in range(args.per_district_cases):
            case_id = next_case_id + len(case_rows)
            crime = rng.choices(crime_heads, weights=crime_weights)[0]
            crime_date = random_date(rng)
            lat = max(min_lat, min(max_lat, rng.uniform(min_lat, max_lat)))
            lng = max(min_lng, min(max_lng, rng.uniform(min_lng, max_lng)))
            station_id = rng.randint(district.station_start, district.station_end)
            case_rows.append({
                "CaseMasterID": case_id,
                "CrimeNo": f"KSP/{district.code}/{case_id:07d}",
                "CrimeRegisteredDate": crime_date.strftime("%Y-%m-%d"),
                "PoliceStationID": station_id,
                "CrimeMajorHeadID": int(crime["CrimeHeadID"]),
                "GravityOffenceID": int(crime["GravityLevel"]),
                "latitude": round(lat, 6),
                "longitude": round(lng, 6),
                "BriefFacts": f"Synthetic {str(crime['CrimeGroupName']).lower()} incident recorded for {district.name} statewide expansion.",
            })

            accused_count = rng.choices([1, 2, 3, 4], weights=[50, 30, 15, 5])[0]
            for _ in range(accused_count):
                if district_repeat_pool and rng.random() < 0.15:
                    identity = rng.choice(district_repeat_pool)
                else:
                    identity = {"AccusedName": fake.name(), "AgeYear": rng.randint(18, 60),
                                "GenderID": rng.choices([1, 2], weights=[75, 25])[0]}
                    if len(district_repeat_pool) < 500:
                        district_repeat_pool.append(identity)
                accused_id = next_accused_id + len(accused_rows)
                accused_rows.append({"AccusedMasterID": accused_id, "CaseMasterID": case_id, **identity})
                if rng.random() < 0.70:
                    arrest_date = min(crime_date + timedelta(days=rng.randint(1, 90)), END_DATE)
                    arrest_rows.append({
                        "ArrestSurrenderID": next_arrest_id + len(arrest_rows),
                        "CaseMasterID": case_id,
                        "AccusedMasterID": accused_id,
                        "ArrestSurrenderDate": arrest_date.strftime("%Y-%m-%d"),
                        "ArrestType": rng.choices(["Arrest", "Surrender"], weights=[80, 20])[0],
                    })
        district_case_counts[district.name] = args.per_district_cases

    frames["CaseMaster"] = pd.concat([cases, pd.DataFrame(case_rows)], ignore_index=True)
    frames["Accused"] = pd.concat([frames["Accused"], pd.DataFrame(accused_rows)], ignore_index=True)
    frames["ArrestSurrender"] = pd.concat([frames["ArrestSurrender"], pd.DataFrame(arrest_rows)], ignore_index=True)
    for name in ("CaseMaster", "Accused", "ArrestSurrender"):
        frames[name].to_csv(paths[name], index=False)

    manifest_path = DATA_DIR / "scale_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    manifest.update({
        "schema_version": 2,
        "statewide_generated_at": datetime.now().isoformat(timespec="seconds"),
        "statewide_seed": args.seed,
        "pre_statewide_rows": original_rows,
        "total_rows": {name: len(frame) for name, frame in frames.items()},
        "district_case_counts": district_case_counts,
        "district_station_ranges": {d.name: [d.station_start, d.station_end] for d in DISTRICTS},
    })
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
