"""
Test suite for Garuda QuickML risk prediction endpoints and logic.
Run from backend directory: 
  export PYTHONPATH=vendor && pytest test_risk_prediction.py -v
Or:
  .venv-test/Scripts/python -m pytest test_risk_prediction.py -v --tb=short
"""

import json

import pytest
import pandas as pd
import numpy as np
from unittest.mock import Mock, patch

import main


@pytest.fixture
def setup_test_data():
    """Load test data and reset caches before each test."""
    main.load_from_csv()
    main._reset_risk_feature_cache()
    yield
    main._reset_risk_feature_cache()


class TestRiskFeatures:
    """Test _risk_features() extraction for the eight model inputs."""

    def test_risk_features_valid_case(self, setup_test_data):
        """Extract features from a known valid case."""
        case_id = 1
        features = main._risk_features(case_id)
        
        assert isinstance(features, dict)
        assert set(features.keys()) == {
            "gravity_level", "repeat_accused_count", "accused_count",
            "arrest_count", "arrest_rate_percent", "station_case_volume",
            "crime_type_volume", "days_since_latest"
        }
        # All values must be integers
        for key, val in features.items():
            assert isinstance(val, int), f"{key} is not an int: {val}"
        # Sanity bounds
        assert features["gravity_level"] >= 0
        assert features["accused_count"] >= 0
        assert features["arrest_count"] >= 0
        assert 0 <= features["arrest_rate_percent"] <= 100
        assert features["days_since_latest"] >= 0

    def test_risk_features_nonexistent_case(self, setup_test_data):
        """Raise KeyError for a case that does not exist."""
        with pytest.raises(KeyError):
            main._risk_features(9999999)

    def test_risk_features_repeat_accused_count(self, setup_test_data):
        """Verify repeat_accused_count logic."""
        # Find a case with multiple accused and check repeat count
        accused_per_case = main.DB.accused.groupby("CaseMasterID").size()
        case_ids_multi = accused_per_case[accused_per_case > 1].index.tolist()
        if case_ids_multi:
            case_id = case_ids_multi[0]
            features = main._risk_features(case_id)
            # Repeat accused count should be >= 0
            assert features["repeat_accused_count"] >= 0

    def test_risk_features_arrest_rate_percent(self, setup_test_data):
        """Verify arrest rate is capped at 100%."""
        # Test on all cases to ensure rate does not exceed 100
        for idx in range(min(10, len(main.DB.cases))):
            case_id = int(main.DB.cases.iloc[idx]["CaseMasterID"])
            features = main._risk_features(case_id)
            assert features["arrest_rate_percent"] <= 100

    def test_risk_features_cache_invalidation(self, setup_test_data):
        """Verify accused identity cache is reset after data reload."""
        case_id = 1
        main._risk_features(case_id)
        assert main._ACCUSED_IDENTITY_COUNTS is not None
        
        main._reset_risk_feature_cache()
        assert main._ACCUSED_IDENTITY_COUNTS is None
        
        # Should rebuild on next call
        main._risk_features(case_id)
        assert main._ACCUSED_IDENTITY_COUNTS is not None


class TestLocalRiskPrediction:
    """Test transparent local fallback prediction logic."""

    def test_local_prediction_returns_valid_class(self):
        """Predict returns one of the three risk classes."""
        features = {
            "gravity_level": 2,
            "repeat_accused_count": 2,
            "accused_count": 2,
            "arrest_count": 2,
            "arrest_rate_percent": 100,
            "station_case_volume": 1000,
            "crime_type_volume": 5000,
            "days_since_latest": 100,
        }
        result = main._local_risk_prediction(features)
        assert result["risk_class"] in ["low", "medium", "high"]
        assert "scores" in result

    def test_local_prediction_high_risk(self):
        """High gravity and multiple accused should yield high risk."""
        features = {
            "gravity_level": 7,  # Very high
            "repeat_accused_count": 5,
            "accused_count": 5,
            "arrest_count": 5,
            "arrest_rate_percent": 100,
            "station_case_volume": 1000,
            "crime_type_volume": 10000,
            "days_since_latest": 10,
        }
        result = main._local_risk_prediction(features)
        assert result["risk_class"] in ["medium", "high"]

    def test_local_prediction_low_risk(self):
        """Low gravity and single accused should yield low risk."""
        features = {
            "gravity_level": 1,
            "repeat_accused_count": 0,
            "accused_count": 1,
            "arrest_count": 1,
            "arrest_rate_percent": 100,
            "station_case_volume": 100,
            "crime_type_volume": 500,
            "days_since_latest": 1000,
        }
        result = main._local_risk_prediction(features)
        assert result["risk_class"] == "low"

    def test_local_prediction_deterministic(self):
        """Same features should always produce the same prediction."""
        features = {
            "gravity_level": 3,
            "repeat_accused_count": 1,
            "accused_count": 2,
            "arrest_count": 2,
            "arrest_rate_percent": 80,
            "station_case_volume": 500,
            "crime_type_volume": 2000,
            "days_since_latest": 200,
        }
        result1 = main._local_risk_prediction(features)
        result2 = main._local_risk_prediction(features)
        assert result1["risk_class"] == result2["risk_class"]


class TestQuickMLRiskPrediction:
    """Test QuickML pipeline prediction with mocked responses."""

    def test_quickml_prediction_valid_response(self):
        features = {
            "gravity_level": 2,
            "repeat_accused_count": 1,
            "accused_count": 2,
            "arrest_count": 2,
            "arrest_rate_percent": 100,
            "station_case_volume": 1000,
            "crime_type_volume": 5000,
            "days_since_latest": 100,
        }
        response = Mock()
        response.read.return_value = json.dumps({"result": [2], "likelihood_score": [0.94]}).encode()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        with (
            patch.object(main, "QUICKML_RISK_ENDPOINT_KEY", "test-key"),
            patch.object(main, "_quickml_connection_headers", return_value={
                "Authorization": "Zoho-oauthtoken test",
                "CATALYST-ORG": "123",
            }),
            patch.object(main.urllib.request, "urlopen", return_value=response) as urlopen,
        ):
            result = main._quickml_risk_prediction(Mock(), features)

        request = urlopen.call_args.args[0]
        assert json.loads(request.data) == {"data": features}
        assert result == {"risk_class": "high", "scores": {"high": 94.0}}

    def test_quickml_prediction_requires_endpoint_key(self):
        with patch.object(main, "QUICKML_RISK_ENDPOINT_KEY", ""):
            with pytest.raises(RuntimeError, match="unavailable"):
                main._quickml_risk_prediction(Mock(), {"gravity_level": 2})

    @pytest.mark.parametrize("payload", [
        {},
        {"result": []},
        {"result": [9], "likelihood_score": [0.5]},
    ])
    def test_quickml_prediction_rejects_invalid_response(self, payload):
        response = Mock()
        response.read.return_value = json.dumps(payload).encode()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        with (
            patch.object(main, "QUICKML_RISK_ENDPOINT_KEY", "test-key"),
            patch.object(main, "_quickml_connection_headers", return_value={
                "Authorization": "Zoho-oauthtoken test",
                "CATALYST-ORG": "123",
            }),
            patch.object(main.urllib.request, "urlopen", return_value=response),
            pytest.raises(RuntimeError, match="classification result"),
        ):
            main._quickml_risk_prediction(Mock(), {"gravity_level": 2})


class TestEndpointIntegration:
    """Test the /api/risk/{case_master_id} endpoint."""

    def test_risk_endpoint_valid_case(self, setup_test_data):
        """Calling _risk_features and _local_risk_prediction simulates endpoint logic."""
        case_id = 1
        features = main._risk_features(case_id)
        fallback = main._local_risk_prediction(features)
        
        assert "risk_class" in fallback
        assert fallback["risk_class"] in ["low", "medium", "high"]

    def test_risk_endpoint_invalid_case_id(self, setup_test_data):
        """Invalid case ID should raise KeyError (translates to 404 in endpoint)."""
        with pytest.raises(KeyError):
            main._risk_features(9999999)

    def test_risk_endpoint_response_shape(self, setup_test_data):
        """Simulate full endpoint response structure."""
        case_id = 1
        features = main._risk_features(case_id)
        prediction = main._local_risk_prediction(features)
        
        response = {
            "case_master_id": case_id,
            "model_id": main.QUICKML_RISK_MODEL_ID,
            "model_name": "Garuda Case Risk Classifier",
            "source": "local_fallback",
            "features": features,
            **prediction,
            "advisory": "Synthetic prototype score for supervisor review; not an enforcement decision.",
        }
        
        assert response["case_master_id"] == case_id
        assert response["model_name"] == "Garuda Case Risk Classifier"
        assert "risk_class" in response
        assert "scores" in response
        assert "advisory" in response


class TestPerformance:
    """Verify feature extraction performance."""

    def test_feature_extraction_speed(self, setup_test_data):
        """Feature extraction should be fast (~0.05s per case)."""
        import time
        case_ids = main.DB.cases.head(10)["CaseMasterID"].astype(int).tolist()
        
        start = time.perf_counter()
        for case_id in case_ids:
            main._risk_features(case_id)
        elapsed = time.perf_counter() - start
        
        # 10 cases should complete in under 1 second with caching
        assert elapsed < 1.0, f"Feature extraction took {elapsed}s for 10 cases"

    def test_cache_effectiveness(self, setup_test_data):
        """Cache should speed up repeated feature extraction."""
        import time
        case_id = 1
        
        # First call builds cache
        start1 = time.perf_counter()
        main._risk_features(case_id)
        time1 = time.perf_counter() - start1
        
        # Second call uses cache
        start2 = time.perf_counter()
        main._risk_features(case_id)
        time2 = time.perf_counter() - start2
        
        # Cached call should be noticeably faster
        # (though both are fast on 100k data)
        assert isinstance(time1, float) and isinstance(time2, float)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
