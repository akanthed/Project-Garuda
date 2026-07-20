"""Generate bilingual Ask Garuda intent-planning examples for QuickML.

Run from the repository root:
    backend/.venv-gen/Scripts/python.exe backend/generate_quickml_training.py
"""

import argparse
import csv
import random
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
CRIME_HEAD_PATH = DATA_DIR / "CrimeHead.csv"
OUTPUT_PATH = DATA_DIR / "quickml_training.csv"
AUTOML_OUTPUT_PATH = DATA_DIR / "zia_automl_training.csv"

AREAS = [
    "KR Market", "MG Road", "Whitefield", "Koramangala", "Hebbal",
    "Jayanagar", "Malleshwaram", "Yelahanka", "Electronic City",
    "HSR Layout", "BTM Layout", "Bannerghatta Road", "Mysuru Road",
    "Indiranagar", "Rajajinagar", "Yeshwantpur", "Marathahalli",
    "Silk Board", "Basavanagudi", "RT Nagar",
]

CRIME_KN = {
    "Cyber Crime": "ಸೈಬರ್ ಅಪರಾಧ",
    "Property Theft": "ಆಸ್ತಿ ಕಳ್ಳತನ",
    "Vehicle Theft": "ವಾಹನ ಕಳ್ಳತನ",
    "Assault & Violence": "ಹಲ್ಲೆ ಮತ್ತು ಹಿಂಸಾಚಾರ",
    "Narcotics": "ಮಾದಕ ವಸ್ತು ಅಪರಾಧ",
    "Murder": "ಕೊಲೆ",
    "Robbery & Dacoity": "ದರೋಡೆ ಮತ್ತು ಡಕಾಯಿತಿ",
    "Fraud & Cheating": "ವಂಚನೆ ಮತ್ತು ಮೋಸ",
    "Unlawful Assembly": "ಕಾನೂನುಬಾಹಿರ ಸಭೆ",
    "Eve Teasing": "ಮಹಿಳಾ ಕಿರುಕುಳ",
    "Land Disputes": "ಭೂ ವಿವಾದ",
    "Communal Offences": "ಕೋಮು ಅಪರಾಧ",
    "Missing Persons": "ಕಾಣೆಯಾದ ವ್ಯಕ್ತಿಗಳು",
    "Domestic Violence": "ಕೌಟುಂಬಿಕ ಹಿಂಸಾಚಾರ",
    "Child Offences": "ಮಕ್ಕಳ ವಿರುದ್ಧದ ಅಪರಾಧ",
}

AREA_KN = {
    "KR Market": "ಕೆಆರ್ ಮಾರ್ಕೆಟ್",
    "MG Road": "ಎಂಜಿ ರಸ್ತೆ",
    "Whitefield": "ವೈಟ್‌ಫೀಲ್ಡ್",
    "Koramangala": "ಕೋರಮಂಗಲ",
    "Hebbal": "ಹೆಬ್ಬಾಳ",
    "Jayanagar": "ಜಯನಗರ",
    "Malleshwaram": "ಮಲ್ಲೇಶ್ವರಂ",
    "Yelahanka": "ಯಲಹಂಕ",
    "Electronic City": "ಎಲೆಕ್ಟ್ರಾನಿಕ್ ಸಿಟಿ",
    "HSR Layout": "ಎಚ್‌ಎಸ್‌ಆರ್ ಲೇಔಟ್",
    "BTM Layout": "ಬಿಟಿಎಂ ಲೇಔಟ್",
    "Bannerghatta Road": "ಬನ್ನೇರುಘಟ್ಟ ರಸ್ತೆ",
    "Mysuru Road": "ಮೈಸೂರು ರಸ್ತೆ",
    "Indiranagar": "ಇಂದಿರಾನಗರ",
    "Rajajinagar": "ರಾಜಾಜಿನಗರ",
    "Yeshwantpur": "ಯಶವಂತಪುರ",
    "Marathahalli": "ಮಾರತಹಳ್ಳಿ",
    "Silk Board": "ಸಿಲ್ಕ್ ಬೋರ್ಡ್",
    "Basavanagudi": "ಬಸವನಗುಡಿ",
    "RT Nagar": "ಆರ್‌ಟಿ ನಗರ",
}

TIME_LABELS = {
    "today": ("today", "ಇಂದು"),
    "this_week": ("this week", "ಈ ವಾರ"),
    "last_month": ("last month", "ಕಳೆದ ತಿಂಗಳು"),
    "last_30_days": ("in the last 30 days", "ಕಳೆದ 30 ದಿನಗಳಲ್ಲಿ"),
    "this_year": ("this year", "ಈ ವರ್ಷ"),
    "all": ("", ""),
}

EN_TEMPLATES = {
    "search_cases": [
        "Show {crime} cases in {area} {time}",
        "Find FIR records for {crime} near {area} {time}",
        "How many {crime} incidents occurred at {area} {time}?",
        "Search reports about {crime} in {area} {time}",
    ],
    "show_hotspots": [
        "Show {crime} hotspots around {area} {time}",
        "Which high-risk areas near {area} have {crime} {time}?",
        "Map danger zones for {crime} in {area} {time}",
        "Analyze hotspot evidence for {crime} at {area} {time}",
    ],
    "investigate_network": [
        "Find repeat accused links for {crime} in {area} {time}",
        "Investigate connected suspects in {crime} cases near {area} {time}",
        "Show the accused and FIR network for {crime} at {area} {time}",
        "Which repeat offenders connect {crime} cases in {area} {time}?",
    ],
}

KN_TEMPLATES = {
    "search_cases": [
        "{area}ದಲ್ಲಿ {time} ನಡೆದ {crime} ಪ್ರಕರಣಗಳನ್ನು ತೋರಿಸಿ",
        "{area} ಸಮೀಪದ {crime} ಎಫ್‌ಐಆರ್ ದಾಖಲೆಗಳನ್ನು {time} ಹುಡುಕಿ",
        "{area}ದಲ್ಲಿ {time} ಎಷ್ಟು {crime} ಘಟನೆಗಳು ನಡೆದಿವೆ?",
        "{area} ಪ್ರದೇಶದ {crime} ವರದಿಗಳನ್ನು {time} ಹುಡುಕಿ",
    ],
    "show_hotspots": [
        "{area} ಸುತ್ತಮುತ್ತ {time} {crime} ಹಾಟ್‌ಸ್ಪಾಟ್‌ಗಳನ್ನು ತೋರಿಸಿ",
        "{area} ಸಮೀಪ {time} {crime} ಹೆಚ್ಚಿನ ಅಪಾಯದ ಪ್ರದೇಶಗಳು ಯಾವುವು?",
        "{area}ದಲ್ಲಿ {time} {crime} ಅಪಾಯ ವಲಯಗಳನ್ನು ನಕ್ಷೆಯಲ್ಲಿ ತೋರಿಸಿ",
        "{area} ಪ್ರದೇಶದ {crime} ಹಾಟ್‌ಸ್ಪಾಟ್ ಸಾಕ್ಷ್ಯವನ್ನು {time} ವಿಶ್ಲೇಷಿಸಿ",
    ],
    "investigate_network": [
        "{area}ದಲ್ಲಿ {time} {crime} ಪುನರಾವರ್ತಿತ ಆರೋಪಿಗಳ ಸಂಪರ್ಕ ಹುಡುಕಿ",
        "{area} ಸಮೀಪದ {crime} ಪ್ರಕರಣಗಳ ಸಂಪರ್ಕಿತ ಶಂಕಿತರನ್ನು {time} ಪರಿಶೀಲಿಸಿ",
        "{area}ದಲ್ಲಿ {time} {crime} ಆರೋಪಿ ಮತ್ತು ಎಫ್‌ಐಆರ್ ಜಾಲವನ್ನು ತೋರಿಸಿ",
        "{area} ಪ್ರದೇಶದ {crime} ಪ್ರಕರಣಗಳನ್ನು ಸಂಪರ್ಕಿಸುವ ಪುನರಾವರ್ತಿತ ಆರೋಪಿಗಳು ಯಾರು?",
    ],
}


def load_crime_types() -> list[str]:
    with CRIME_HEAD_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        return [row["CrimeGroupName"] for row in csv.DictReader(handle)]


def build_row(index: int, action: str, language: str, rng: random.Random, crimes: list[str]) -> dict:
    crime = rng.choice(crimes)
    area = rng.choice(AREAS)
    time_window = rng.choice(list(TIME_LABELS))
    time_en, time_kn = TIME_LABELS[time_window]
    if language == "kn":
        query = rng.choice(KN_TEMPLATES[action]).format(
            crime=CRIME_KN[crime], area=AREA_KN[area], time=time_kn
        )
    else:
        query = rng.choice(EN_TEMPLATES[action]).format(crime=crime, area=area, time=time_en)
    return {
        "example_id": f"AG-{index:05d}",
        "query": " ".join(query.split()),
        "action": action,
        "crime_type": crime,
        "area": area,
        "time_window": time_window,
        "language": language,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=10_000)
    parser.add_argument("--seed", type=int, default=20260720)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--automl-output", type=Path, default=AUTOML_OUTPUT_PATH)
    args = parser.parse_args()
    if args.rows < 6:
        raise SystemExit("--rows must be at least 6 to cover all action/language combinations")

    rng = random.Random(args.seed)
    crimes = load_crime_types()
    combinations = [
        (action, language)
        for action in ("search_cases", "show_hotspots", "investigate_network")
        for language in ("en", "kn")
    ]
    rows = [
        build_row(index + 1, *combinations[index % len(combinations)], rng, crimes)
        for index in range(args.rows)
    ]
    rng.shuffle(rows)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    action_classes = {"search_cases": "case_search", "show_hotspots": "hotspot", "investigate_network": "network"}
    crime_ids = {crime: index for index, crime in enumerate(crimes, start=1)}
    area_ids = {area: index for index, area in enumerate(AREAS, start=1)}
    time_ids = {name: index for index, name in enumerate(TIME_LABELS)}
    automl_rows = []
    for row in rows:
        action = row["action"]
        automl_rows.append({
            "crime_type_id": crime_ids[row["crime_type"]],
            "area_id": area_ids[row["area"]],
            "time_window_id": time_ids[row["time_window"]],
            "language_id": 1 if row["language"] == "kn" else 0,
            "has_case_terms": 1 if action == "search_cases" else 0,
            "has_hotspot_terms": 1 if action == "show_hotspots" else 0,
            "has_network_terms": 1 if action == "investigate_network" else 0,
            "action_class": action_classes[action],
        })
    args.automl_output.parent.mkdir(parents=True, exist_ok=True)
    with args.automl_output.open("w", encoding="ascii", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(automl_rows[0]))
        writer.writeheader()
        writer.writerows(automl_rows)

    action_counts = {action: sum(row["action"] == action for row in rows) for action, _ in combinations[::2]}
    language_counts = {language: sum(row["language"] == language for row in rows) for language in ("en", "kn")}
    print({
        "quickml_output": str(args.output),
        "zia_automl_output": str(args.automl_output),
        "rows": len(rows),
        "actions": action_counts,
        "languages": language_counts,
    })


if __name__ == "__main__":
    main()
