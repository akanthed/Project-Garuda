"""Build a Zia AutoML-compatible synthetic case-risk classification dataset.

The output contains only complete numerical/categorical columns. It is intended
for prototype performance validation, not operational enforcement decisions.
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_PATH = DATA_DIR / "zia_risk_training.csv"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=100_000)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()

    cases = pd.read_csv(DATA_DIR / "CaseMaster.csv")
    accused = pd.read_csv(DATA_DIR / "Accused.csv")
    arrests = pd.read_csv(DATA_DIR / "ArrestSurrender.csv")
    if args.rows < len(cases):
        cases = cases.sample(n=args.rows, random_state=20260720).sort_values("CaseMasterID")

    accused["NormalizedName"] = accused["AccusedName"].astype(str).str.strip().str.casefold()
    identity_case_counts = accused.groupby("NormalizedName")["CaseMasterID"].nunique()
    accused["IsRepeat"] = accused["NormalizedName"].map(identity_case_counts).gt(1).astype(int)
    accused_features = accused.groupby("CaseMasterID").agg(
        accused_count=("AccusedMasterID", "count"),
        repeat_accused_count=("IsRepeat", "sum"),
        mean_accused_age=("AgeYear", "mean"),
    )
    arrest_counts = arrests.groupby("CaseMasterID")["ArrestSurrenderID"].count().rename("arrest_count")

    frame = cases.merge(accused_features, left_on="CaseMasterID", right_index=True, how="left")
    frame = frame.merge(arrest_counts, left_on="CaseMasterID", right_index=True, how="left")
    frame[["accused_count", "repeat_accused_count", "arrest_count"]] = frame[
        ["accused_count", "repeat_accused_count", "arrest_count"]
    ].fillna(0)
    frame["mean_accused_age"] = frame["mean_accused_age"].fillna(35)

    dates = pd.to_datetime(frame["CrimeRegisteredDate"], errors="raise")
    latest_date = dates.max()
    station_volume = frame.groupby("PoliceStationID")["CaseMasterID"].transform("count")
    crime_volume = frame.groupby("CrimeMajorHeadID")["CaseMasterID"].transform("count")
    arrest_rate = frame["arrest_count"].div(frame["accused_count"].clip(lower=1))
    recency = 1 - (latest_date - dates).dt.days.div(max(1, (latest_date - dates).dt.days.max()))
    station_pressure = station_volume.rank(pct=True)
    crime_pressure = crime_volume.rank(pct=True)
    rng = np.random.default_rng(20260720)
    risk_score = (
        frame["GravityOffenceID"] * 3.0
        + frame["accused_count"].clip(upper=4) * 0.8
        + frame["repeat_accused_count"].clip(upper=4) * 1.3
        + station_pressure * 2.0
        + crime_pressure * 1.0
        + recency * 1.5
        - arrest_rate.clip(upper=1) * 0.6
        + rng.normal(0, 0.45, len(frame))
    )
    frame["risk_class"] = pd.qcut(risk_score, q=3, labels=["low", "medium", "high"])

    output = pd.DataFrame({
        "gravity_level": frame["GravityOffenceID"].astype(int),
        "crime_type_id": frame["CrimeMajorHeadID"].astype(int),
        "station_id": frame["PoliceStationID"].astype(int),
        "incident_year": dates.dt.year.astype(int),
        "incident_month": dates.dt.month.astype(int),
        "days_since_latest": (latest_date - dates).dt.days.astype(int),
        "station_case_volume": station_volume.astype(int),
        "crime_type_volume": crime_volume.astype(int),
        "accused_count": frame["accused_count"].astype(int),
        "repeat_accused_count": frame["repeat_accused_count"].astype(int),
        "mean_accused_age": frame["mean_accused_age"].round().astype(int),
        "arrest_count": frame["arrest_count"].astype(int),
        "arrest_rate_percent": (arrest_rate.clip(upper=1) * 100).round().astype(int),
        "risk_class": frame["risk_class"].astype(str),
    })
    if output.isna().any().any():
        raise RuntimeError("Generated risk dataset contains missing values")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False, encoding="ascii")
    print({
        "output": str(args.output),
        "rows": len(output),
        "columns": len(output.columns),
        "classes": output["risk_class"].value_counts().sort_index().to_dict(),
    })


if __name__ == "__main__":
    main()
