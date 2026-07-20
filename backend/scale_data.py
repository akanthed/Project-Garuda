"""Append synthetic relational records without changing the existing seeded prefix.

Run from backend/: python scale_data.py --target-cases 100000
"""

import argparse
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
from faker import Faker

DATA_DIR = Path(__file__).parent / "data"
END_DATE = datetime(2026, 6, 30)
START_DATE = datetime(2022, 1, 1)
AREAS = [
    (12.9716, 77.5946), (12.9758, 77.6072), (12.9698, 77.7499),
    (12.9352, 77.6245), (12.8399, 77.6770), (13.0218, 77.5510),
    (12.9900, 77.5800), (12.9600, 77.6400), (12.9100, 77.6500),
    (13.0100, 77.6200),
]


def random_date(rng: random.Random) -> datetime:
    seconds = int((END_DATE - START_DATE).total_seconds())
    return START_DATE + timedelta(seconds=rng.randint(0, seconds))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target-cases", type=int, default=100_000)
    parser.add_argument("--seed", type=int, default=20260720)
    args = parser.parse_args()

    paths = {name: DATA_DIR / f"{name}.csv" for name in ("CaseMaster", "Accused", "ArrestSurrender", "CrimeHead")}
    frames = {name: pd.read_csv(path) for name, path in paths.items()}
    original_rows = {name: len(frame) for name, frame in frames.items()}
    cases = frames["CaseMaster"]
    if args.target_cases <= len(cases):
        print(f"CaseMaster already has {len(cases):,} rows; nothing to append.")
        return

    rng = random.Random(args.seed)
    fake = Faker("en_IN")
    fake.seed_instance(args.seed)
    crime_heads = frames["CrimeHead"].to_dict(orient="records")
    crime_weights = [1 / (float(item["GravityLevel"]) * 0.5 + 1) for item in crime_heads]
    next_case_id = int(cases["CaseMasterID"].max()) + 1
    next_accused_id = int(frames["Accused"]["AccusedMasterID"].max()) + 1
    next_arrest_id = int(frames["ArrestSurrender"]["ArrestSurrenderID"].max()) + 1
    additions = args.target_cases - len(cases)

    case_rows: list[dict] = []
    accused_rows: list[dict] = []
    arrest_rows: list[dict] = []
    repeat_names = frames["Accused"].drop_duplicates("AccusedName").tail(500)[["AccusedName", "AgeYear", "GenderID"]].to_dict(orient="records")

    for offset in range(additions):
        case_id = next_case_id + offset
        crime = rng.choices(crime_heads, weights=crime_weights)[0]
        crime_date = random_date(rng)
        center_lat, center_lng = rng.choice(AREAS)
        lat = max(12.80, min(13.10, center_lat + rng.gauss(0, 0.015)))
        lng = max(77.40, min(77.75, center_lng + rng.gauss(0, 0.015)))
        case_rows.append({
            "CaseMasterID": case_id,
            "CrimeNo": f"KSP/SYN/{case_id:07d}",
            "CrimeRegisteredDate": crime_date.strftime("%Y-%m-%d"),
            "PoliceStationID": rng.randint(1, 100),
            "CrimeMajorHeadID": int(crime["CrimeHeadID"]),
            "GravityOffenceID": int(crime["GravityLevel"]),
            "latitude": round(lat, 6),
            "longitude": round(lng, 6),
            "BriefFacts": f"Synthetic {str(crime['CrimeGroupName']).lower()} incident recorded for scale validation.",
        })

        accused_count = rng.choices([1, 2, 3, 4], weights=[50, 30, 15, 5])[0]
        for _ in range(accused_count):
            if repeat_names and rng.random() < 0.15:
                identity = rng.choice(repeat_names)
            else:
                identity = {"AccusedName": fake.name(), "AgeYear": rng.randint(18, 60), "GenderID": rng.choices([1, 2], weights=[75, 25])[0]}
                if len(repeat_names) < 1_500:
                    repeat_names.append(identity)
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

    frames["CaseMaster"] = pd.concat([cases, pd.DataFrame(case_rows)], ignore_index=True)
    frames["Accused"] = pd.concat([frames["Accused"], pd.DataFrame(accused_rows)], ignore_index=True)
    frames["ArrestSurrender"] = pd.concat([frames["ArrestSurrender"], pd.DataFrame(arrest_rows)], ignore_index=True)
    for name in ("CaseMaster", "Accused", "ArrestSurrender"):
        frames[name].to_csv(paths[name], index=False)

    manifest = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "original_rows": original_rows,
        "total_rows": {name: len(frame) for name, frame in frames.items()},
        "target_cases": args.target_cases,
    }
    (DATA_DIR / "scale_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
