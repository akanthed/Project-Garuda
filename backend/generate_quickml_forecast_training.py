"""Build complete station-month time series for QuickML forecasting."""

import argparse
from pathlib import Path

import pandas as pd

from karnataka_districts import district_of_station


DATA_DIR = Path(__file__).parent / "data"
OUTPUT_PATH = DATA_DIR / "quickml_forecast_training.csv"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()

    cases = pd.read_csv(DATA_DIR / "CaseMaster.csv")
    cases["month_start"] = pd.to_datetime(cases["CrimeRegisteredDate"], errors="raise").dt.to_period("M").dt.to_timestamp()
    stations = sorted(cases["PoliceStationID"].astype(int).unique())
    months = pd.date_range(cases["month_start"].min(), cases["month_start"].max(), freq="MS")
    complete_index = pd.MultiIndex.from_product([stations, months], names=["station_id", "month_start"])

    monthly = cases.groupby(["PoliceStationID", "month_start"]).agg(
        case_count=("CaseMasterID", "size"),
        serious_case_count=("GravityOffenceID", lambda values: int((values >= 4).sum())),
    )
    monthly.index.names = ["station_id", "month_start"]
    output = monthly.reindex(complete_index, fill_value=0).reset_index()
    output["district_id"] = output["station_id"].map(lambda station_id: district_of_station(int(station_id)).district_id)
    output["month_start"] = output["month_start"].dt.strftime("%Y-%m-%d")
    output = output[["month_start", "station_id", "district_id", "case_count", "serious_case_count"]]

    if output.isna().any().any():
        raise RuntimeError("Forecast dataset contains missing values")
    expected_rows = len(stations) * len(months)
    if len(output) != expected_rows:
        raise RuntimeError(f"Expected {expected_rows} station-month rows, found {len(output)}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False, encoding="ascii")
    print({
        "output": str(args.output),
        "rows": len(output),
        "stations": len(stations),
        "months": len(months),
        "start": output["month_start"].min(),
        "end": output["month_start"].max(),
        "case_total": int(output["case_count"].sum()),
    })


if __name__ == "__main__":
    main()