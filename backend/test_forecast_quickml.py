import json
from unittest.mock import Mock, patch

import pandas as pd

import main


def test_quickml_forecast_features_match_training_schema():
    months = pd.period_range("2025-01", periods=12, freq="M")
    series = pd.Series(range(1, 13), index=months)

    features = main._quickml_forecast_features(1, series)

    assert features == {
        "target_month": "2026-01-01",
        "station_id": 1,
        "district_id": 1,
        "month_number": 12,
        "lag_1": 12,
        "lag_2": 11,
        "lag_3": 10,
        "lag_12": 1,
        "rolling_3": 11.0,
        "rolling_6": 9.5,
    }


def test_quickml_forecast_batches_station_rows():
    station_features = [
        (1, {"station_id": 1, "lag_1": 10}),
        (2, {"station_id": 2, "lag_1": 20}),
    ]
    response = Mock()
    response.read.return_value = json.dumps({"result": [11.5, 19.25]}).encode()
    response.__enter__ = Mock(return_value=response)
    response.__exit__ = Mock(return_value=False)
    with (
        patch.object(main, "QUICKML_FORECAST_ENDPOINT_KEY", "test-key"),
        patch.object(main, "_quickml_connection_headers", return_value={
            "Authorization": "Zoho-oauthtoken test",
            "CATALYST-ORG": "123",
        }),
        patch.object(main.urllib.request, "urlopen", return_value=response) as urlopen,
    ):
        predictions = main._quickml_forecast_predictions(Mock(), station_features)

    request = urlopen.call_args.args[0]
    assert json.loads(request.data) == {"data": [row for _, row in station_features]}
    assert predictions == {1: 11.5, 2: 19.25}


def test_six_month_statewide_backtest_includes_quickml_score():
    main.load_from_csv()
    cases = main.DB.cases
    with patch.object(main, "QUICKML_FORECAST_ENDPOINT_KEY", "configured"):
        result = main._backtest_forecast_models(cases, test_months=6)

    quickml = next(score for score in result["models"] if score["model"] == "quickml_gb_regression")
    assert quickml == main.QUICKML_FORECAST_HOLDOUT_SCORE
    assert result["best_model_by_mae"] == "quickml_gb_regression"
    assert result["deployed_model"] == "quickml_gb_regression"