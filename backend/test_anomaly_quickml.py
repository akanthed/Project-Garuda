import json
import asyncio
from unittest.mock import Mock, patch

import pandas as pd

import main


def test_quickml_anomaly_features_match_training_schema():
    months = pd.period_range("2025-01", periods=13, freq="M")
    series = pd.Series(range(1, 14), index=months)

    features, z_score = main._quickml_anomaly_features(1, series)

    assert features == {
        "target_month": "2026-01-01",
        "station_id": 1,
        "district_id": 1,
        "month_number": 1,
        "current_count": 13,
        "lag_1": 12,
        "lag_2": 11,
        "lag_3": 10,
        "lag_12": 1,
        "rolling_mean_6": 9.5,
        "rolling_mean_12": 6.5,
        "rolling_std_12": 3.606,
    }
    assert z_score == 1.8


def test_quickml_anomaly_batches_station_rows():
    station_features = [
        (1, {"station_id": 1, "current_count": 10}),
        (2, {"station_id": 2, "current_count": 20}),
    ]
    response = Mock()
    response.read.return_value = json.dumps({"result": [0, 1]}).encode()
    response.__enter__ = Mock(return_value=response)
    response.__exit__ = Mock(return_value=False)
    with (
        patch.object(main, "QUICKML_ANOMALY_ENDPOINT_KEY", "test-key"),
        patch.object(main, "_quickml_connection_headers", return_value={
            "Authorization": "Zoho-oauthtoken test",
            "CATALYST-ORG": "123",
        }),
        patch.object(main.urllib.request, "urlopen", return_value=response) as urlopen,
    ):
        predictions = main._quickml_anomaly_predictions(Mock(), station_features)

    request = urlopen.call_args.args[0]
    assert json.loads(request.data) == {"data": [row for _, row in station_features]}
    assert predictions == {1: 0, 2: 1}


def test_anomaly_route_reports_quickml_source():
    months = pd.period_range("2025-01", periods=13, freq="M")
    series = pd.Series(range(1, 14), index=months)
    with (
        patch.object(main, "ensure_data_loaded", return_value=True),
        patch.object(main, "_try_catalyst_app", return_value=Mock()),
        patch.object(main, "cache_get", return_value=None),
        patch.object(main, "cache_set"),
        patch.object(main, "_scope_filter", return_value=Mock()),
        patch.object(main, "_monthly_counts_by_station", return_value={1: series}),
        patch.object(main, "_quickml_anomaly_predictions", return_value={1: 1}),
    ):
        result = asyncio.run(main.get_anomalies(Mock(), None, None))

    assert result[0]["source"] == "quickml_pipeline"
    assert result[0]["model_id"] == "6441000000007163"


def test_anomaly_route_falls_back_locally():
    fallback = [{
        "station_id": 1,
        "station_name": "Station 1",
        "z_score": 2.5,
        "current_count": 10,
        "mean_count": 4.0,
        "severity": "high",
    }]
    with (
        patch.object(main, "ensure_data_loaded", return_value=True),
        patch.object(main, "_try_catalyst_app", return_value=Mock()),
        patch.object(main, "cache_get", return_value=None),
        patch.object(main, "cache_set"),
        patch.object(main, "_scope_filter", return_value=Mock()),
        patch.object(main, "_monthly_counts_by_station", return_value={}),
        patch.object(main, "_quickml_anomaly_predictions", side_effect=RuntimeError("offline")),
        patch.object(main, "_compute_anomalies", return_value=fallback),
    ):
        result = asyncio.run(main.get_anomalies(Mock(), None, None))

    assert result == [{**fallback[0], "source": "local_fallback", "model_id": None}]