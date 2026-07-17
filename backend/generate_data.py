"""
KSP Synthetic Data Generator
Generates 5,000 realistic FIR records following the exact KSP ER schema.
Run once: python generate_data.py
Outputs: data/CaseMaster.csv, Accused.csv, CrimeHead.csv, ArrestSurrender.csv
"""

import os
import random
import pandas as pd
from faker import Faker
from datetime import datetime, timedelta

fake = Faker("en_IN")
random.seed(42)

# ─── Output directory ─────────────────────────────────────────────────────────

os.makedirs("data", exist_ok=True)

# ─── Constants ────────────────────────────────────────────────────────────────

TOTAL_CASES = 5000
TOTAL_ACCUSED = 8500  # ~1.7 accused per case on average
STATION_IDS = list(range(1, 101))  # 100 police stations

CRIME_HEADS = [
    (1,  "Cyber Crime",         4),   # GravityOffenceID (1=low, 5=critical)
    (2,  "Property Theft",      3),
    (3,  "Vehicle Theft",       3),
    (4,  "Assault & Violence",  4),
    (5,  "Narcotics",           5),
    (6,  "Murder",              5),
    (7,  "Robbery & Dacoity",   5),
    (8,  "Fraud & Cheating",    3),
    (9,  "Unlawful Assembly",   2),
    (10, "Eve Teasing",         2),
    (11, "Land Disputes",       3),
    (12, "Communal Offences",   4),
    (13, "Missing Persons",     2),
    (14, "Domestic Violence",   3),
    (15, "Child Offences",      5),
]

# Bengaluru bounding box — clustered around known high-density zones
HOTSPOT_ZONES = [
    # (center_lat, center_lng, weight, zone_name)
    (12.9716, 77.5946, 0.18, "KR Market"),
    (12.9758, 77.6072, 0.12, "MG Road"),
    (12.9698, 77.7499, 0.14, "Whitefield"),
    (12.9352, 77.6245, 0.10, "Koramangala"),
    (12.8399, 77.6770, 0.08, "Electronic City"),
    (13.0218, 77.5510, 0.07, "Yeshwantpur"),
    (12.9900, 77.5800, 0.09, "Rajajinagar"),
    (12.9600, 77.6400, 0.08, "Indiranagar"),
    (12.9100, 77.6500, 0.07, "BTM Layout"),
    (13.0100, 77.6200, 0.07, "Hebbal"),
]

def sample_coords() -> tuple[float, float]:
    """Pick a coordinate biased toward real Bengaluru hotspot clusters."""
    weights = [z[2] for z in HOTSPOT_ZONES]
    zone = random.choices(HOTSPOT_ZONES, weights=weights)[0]
    lat = zone[0] + random.gauss(0, 0.015)
    lng = zone[1] + random.gauss(0, 0.015)
    # Clamp to Bengaluru bounding box
    lat = max(12.80, min(13.10, lat))
    lng = max(77.40, min(77.75, lng))
    return round(lat, 6), round(lng, 6)

def random_date(start: datetime, end: datetime) -> datetime:
    delta = end - start
    return start + timedelta(seconds=random.randint(0, int(delta.total_seconds())))

START_DATE = datetime(2022, 1, 1)
END_DATE   = datetime(2026, 6, 30)

BRIEF_TEMPLATES = [
    "Complainant reported {crime} at {location}. Suspect fled the scene.",
    "FIR lodged following {crime} incident. Victim sustained minor injuries.",
    "Anonymous tip received regarding {crime}. Investigation initiated.",
    "{crime} reported near {location}. CCTV footage under review.",
    "Patrol unit responded to {crime} call. One suspect apprehended.",
]

LOCATIONS = ["KR Market", "MG Road", "Whitefield", "Koramangala", "Hebbal",
             "Jayanagar", "Malleshwaram", "Yelahanka", "Electronic City",
             "HSR Layout", "BTM Layout", "Bannerghatta Road", "Mysuru Road"]

# ─── Generate CrimeHead ───────────────────────────────────────────────────────

crime_head_rows = []
for cid, name, gravity in CRIME_HEADS:
    crime_head_rows.append({
        "CrimeHeadID":   cid,
        "CrimeGroupName": name,
        "GravityLevel":  gravity,
    })

df_crime_head = pd.DataFrame(crime_head_rows)
df_crime_head.to_csv("data/CrimeHead.csv", index=False)
print(f"✔ CrimeHead.csv — {len(df_crime_head)} rows")

# ─── Generate CaseMaster ─────────────────────────────────────────────────────

case_rows = []
crime_weights = [1 / (c[2] * 0.5 + 1) for c in CRIME_HEADS]  # Lower gravity = more frequent

for i in range(1, TOTAL_CASES + 1):
    crime_idx = random.choices(range(len(CRIME_HEADS)), weights=crime_weights)[0]
    crime_head = CRIME_HEADS[crime_idx]
    lat, lng = sample_coords()
    crime_date = random_date(START_DATE, END_DATE)
    brief = random.choice(BRIEF_TEMPLATES).format(
        crime=crime_head[1].lower(),
        location=random.choice(LOCATIONS)
    )
    case_rows.append({
        "CaseMasterID":        i,
        "CrimeNo":             f"KSP/{crime_date.year}/{random.randint(1000, 9999)}",
        "CrimeRegisteredDate": crime_date.strftime("%Y-%m-%d"),
        "PoliceStationID":     random.choice(STATION_IDS),
        "CrimeMajorHeadID":    crime_head[0],
        "GravityOffenceID":    crime_head[2],
        "latitude":            lat,
        "longitude":           lng,
        "BriefFacts":          brief,
    })

df_cases = pd.DataFrame(case_rows)
df_cases.to_csv("data/CaseMaster.csv", index=False)
print(f"✔ CaseMaster.csv — {len(df_cases)} rows")

# ─── Generate Accused ─────────────────────────────────────────────────────────

accused_rows = []
accused_id = 1

# Assign 1-4 accused per case; some accused span multiple cases (syndicate effect)
case_ids = list(range(1, TOTAL_CASES + 1))
random.shuffle(case_ids)

# Create a pool of "repeat offenders" (10% of accused appear in multiple cases)
repeat_pool = []

for case_id in case_ids:
    num_accused = random.choices([1, 2, 3, 4], weights=[50, 30, 15, 5])[0]
    for _ in range(num_accused):
        if repeat_pool and random.random() < 0.15:
            # Reuse an existing accused (creates syndicate links)
            existing = random.choice(repeat_pool)
            accused_rows.append({
                "AccusedMasterID": accused_id,
                "CaseMasterID":    case_id,
                "AccusedName":     existing["AccusedName"],
                "AgeYear":         existing["AgeYear"],
                "GenderID":        existing["GenderID"],
            })
        else:
            name = fake.name()
            age = random.randint(18, 60)
            gender = random.choices([1, 2], weights=[75, 25])[0]  # 1=Male, 2=Female
            row = {
                "AccusedMasterID": accused_id,
                "CaseMasterID":    case_id,
                "AccusedName":     name,
                "AgeYear":         age,
                "GenderID":        gender,
            }
            accused_rows.append(row)
            if len(repeat_pool) < 500:
                repeat_pool.append(row)
        accused_id += 1

df_accused = pd.DataFrame(accused_rows)
df_accused.to_csv("data/Accused.csv", index=False)
print(f"✔ Accused.csv — {len(df_accused)} rows")

# ─── Generate ArrestSurrender ─────────────────────────────────────────────────

arrest_rows = []
# ~70% of accused get arrested
arrested_accused = df_accused.sample(frac=0.70, random_state=42)

for _, row in arrested_accused.iterrows():
    case_date_str = df_cases.loc[df_cases["CaseMasterID"] == row["CaseMasterID"], "CrimeRegisteredDate"]
    if case_date_str.empty:
        continue
    case_date = datetime.strptime(case_date_str.values[0], "%Y-%m-%d")
    # Arrested 1-90 days after crime registration
    arrest_date = case_date + timedelta(days=random.randint(1, 90))
    if arrest_date > END_DATE:
        arrest_date = END_DATE

    arrest_rows.append({
        "ArrestSurrenderID":   len(arrest_rows) + 1,
        "CaseMasterID":        int(row["CaseMasterID"]),
        "AccusedMasterID":     int(row["AccusedMasterID"]),
        "ArrestSurrenderDate": arrest_date.strftime("%Y-%m-%d"),
        "ArrestType":          random.choices(["Arrest", "Surrender"], weights=[80, 20])[0],
    })

df_arrests = pd.DataFrame(arrest_rows)
df_arrests.to_csv("data/ArrestSurrender.csv", index=False)
print(f"✔ ArrestSurrender.csv — {len(df_arrests)} rows")

# ─── Summary ──────────────────────────────────────────────────────────────────

print("\n📊 Dataset Summary")
print(f"  Cases:          {len(df_cases)}")
print(f"  Accused:        {len(df_accused)}")
print(f"  Arrests:        {len(df_arrests)}")
print(f"  Crime types:    {len(df_crime_head)}")
print(f"  Date range:     {START_DATE.date()} → {END_DATE.date()}")
print(f"\n  Gravity distribution:")
for gid, count in df_cases['GravityOffenceID'].value_counts().sort_index().items():
    print(f"    Level {gid}: {count} cases")
print("\n✅ All CSVs saved to ./data/")
