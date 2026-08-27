"""Build station-month features for a QuickML anomaly classifier."""

import argparse
from pathlib import Path

import pandas as pd

from generate_quickml_forecast_training import DATA_DIR
from karnataka_districts import district_of_station


TRAIN_PATH = DATA_DIR / "quickml_station_anomaly_train.csv"
HOLDOUT_PATH = DATA_DIR / "quickml_station_anomaly_holdout.csv"
FEATURE_COLUMNS = [
    "target_month", "station_id", "district_id", "month_number",
    "current_count", "lag_1", "lag_2", "lag_3", "lag_12",
    "rolling_mean_6", "rolling_mean_12", "rolling_std_12", "anomaly_class",
]


def build_rows() -> pd.DataFrame:
    cases = pd.read_csv(DATA_DIR / "CaseMaster.csv")
    cases["month"] = pd.to_datetime(cases["CrimeRegisteredDate"], errors="raise").dt.to_period("M")
    stations = sorted(cases["PoliceStationID"].astype(int).unique())
    months = pd.period_range(cases["month"].min(), cases["month"].max(), freq="M")
    index = pd.MultiIndex.from_product([stations, months], names=["station_id", "month"])
    counts = cases.groupby(["PoliceStationID", "month"]).size()
    counts.index.names = ["station_id", "month"]
    rows = counts.reindex(index, fill_value=0).rename("current_count").reset_index()

    grouped = rows.groupby("station_id")["current_count"]
    for lag in (1, 2, 3, 12):
        rows[f"lag_{lag}"] = grouped.shift(lag)
    rows["rolling_mean_6"] = grouped.transform(lambda values: values.shift(1).rolling(6).mean())
    rows["rolling_mean_12"] = grouped.transform(lambda values: values.shift(1).rolling(12).mean())
    rows["rolling_std_12"] = grouped.transform(lambda values: values.shift(1).rolling(12).std()).replace(0, 1)
    rows["anomaly_class"] = (
        (rows["current_count"] - rows["rolling_mean_12"]) / rows["rolling_std_12"] >= 2.0
    ).astype(int)
    rows["district_id"] = rows["station_id"].map(
        lambda station_id: district_of_station(int(station_id)).district_id
    )
    rows["month_number"] = rows["month"].dt.month
    rows["target_month"] = rows["month"].dt.to_timestamp()
    rows = rows.dropna().copy()
    integer_columns = ["station_id", "district_id", "month_number", "current_count", "lag_1", "lag_2", "lag_3", "lag_12", "anomaly_class"]
    rows[integer_columns] = rows[integer_columns].astype(int)
    decimal_columns = ["rolling_mean_6", "rolling_mean_12", "rolling_std_12"]
    rows[decimal_columns] = rows[decimal_columns].round(3)
    return rows[FEATURE_COLUMNS]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-output", type=Path, default=TRAIN_PATH)
    parser.add_argument("--holdout-output", type=Path, default=HOLDOUT_PATH)
    parser.add_argument("--holdout-start", default="2026-01-01")
    args = parser.parse_args()

    rows = build_rows()
    holdout_start = pd.Timestamp(args.holdout_start)
    train_pool = rows[rows["target_month"] < holdout_start].copy()
    positives = train_pool[train_pool["anomaly_class"] == 1]
    negatives = train_pool[train_pool["anomaly_class"] == 0].sample(
        n=min(len(train_pool) - len(positives), len(positives) * 3),
        random_state=42,
    )
    train = pd.concat([positives, negatives]).sample(frac=1, random_state=42)
    holdout = rows[rows["target_month"] >= holdout_start].copy()
    for frame in (train, holdout):
        frame["target_month"] = frame["target_month"].dt.strftime("%Y-%m-%d")

    args.train_output.parent.mkdir(parents=True, exist_ok=True)
    train.to_csv(args.train_output, index=False, encoding="ascii")
    holdout.to_csv(args.holdout_output, index=False, encoding="ascii")
    print({
        "train_rows": len(train),
        "train_anomalies": int(train["anomaly_class"].sum()),
        "holdout_rows": len(holdout),
        "holdout_anomalies": int(holdout["anomaly_class"].sum()),
        "holdout_months": sorted(holdout["target_month"].unique().tolist()),
    })


if __name__ == "__main__":
    main()