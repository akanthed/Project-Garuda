"""Build station-level lag features for QuickML regression forecasting."""

import argparse
from pathlib import Path

import pandas as pd

from generate_quickml_forecast_training import DATA_DIR
from karnataka_districts import district_of_station


TRAIN_PATH = DATA_DIR / "quickml_station_forecast_train.csv"
HOLDOUT_PATH = DATA_DIR / "quickml_station_forecast_holdout.csv"


def build_rows() -> pd.DataFrame:
    cases = pd.read_csv(DATA_DIR / "CaseMaster.csv")
    cases["month"] = pd.to_datetime(cases["CrimeRegisteredDate"], errors="raise").dt.to_period("M")
    stations = sorted(cases["PoliceStationID"].astype(int).unique())
    months = pd.period_range(cases["month"].min(), cases["month"].max(), freq="M")
    index = pd.MultiIndex.from_product([stations, months], names=["station_id", "month"])
    counts = cases.groupby(["PoliceStationID", "month"]).size()
    counts.index.names = ["station_id", "month"]
    complete = counts.reindex(index, fill_value=0).rename("case_count").reset_index()

    grouped = complete.groupby("station_id")["case_count"]
    for lag in (1, 2, 3, 12):
        complete[f"lag_{lag}"] = grouped.shift(lag)
    complete["rolling_3"] = grouped.transform(lambda values: values.shift(1).rolling(3).mean())
    complete["rolling_6"] = grouped.transform(lambda values: values.shift(1).rolling(6).mean())
    complete["target_next_month"] = grouped.shift(-1)
    complete["district_id"] = complete["station_id"].map(lambda station_id: district_of_station(int(station_id)).district_id)
    complete["month_number"] = complete["month"].dt.month
    complete["target_month"] = (complete["month"] + 1).dt.to_timestamp()
    complete = complete.dropna().copy()
    complete[["lag_1", "lag_2", "lag_3", "lag_12", "target_next_month"]] = complete[
        ["lag_1", "lag_2", "lag_3", "lag_12", "target_next_month"]
    ].astype(int)
    complete[["rolling_3", "rolling_6"]] = complete[["rolling_3", "rolling_6"]].round(3)
    return complete[[
        "target_month", "station_id", "district_id", "month_number",
        "lag_1", "lag_2", "lag_3", "lag_12", "rolling_3", "rolling_6",
        "target_next_month",
    ]]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-output", type=Path, default=TRAIN_PATH)
    parser.add_argument("--holdout-output", type=Path, default=HOLDOUT_PATH)
    parser.add_argument("--holdout-start", default="2026-01-01")
    args = parser.parse_args()

    rows = build_rows()
    holdout_start = pd.Timestamp(args.holdout_start)
    train = rows[rows["target_month"] < holdout_start].copy()
    holdout = rows[rows["target_month"] >= holdout_start].copy()
    for frame in (train, holdout):
        frame["target_month"] = frame["target_month"].dt.strftime("%Y-%m-%d")

    args.train_output.parent.mkdir(parents=True, exist_ok=True)
    train.to_csv(args.train_output, index=False, encoding="ascii")
    holdout.to_csv(args.holdout_output, index=False, encoding="ascii")
    print({
        "train_rows": len(train),
        "holdout_rows": len(holdout),
        "holdout_months": sorted(holdout["target_month"].unique().tolist()),
        "stations": rows["station_id"].nunique(),
        "train_target_total": int(train["target_next_month"].sum()),
        "holdout_target_total": int(holdout["target_next_month"].sum()),
    })


if __name__ == "__main__":
    main()