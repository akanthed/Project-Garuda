import asyncio
from unittest.mock import Mock, patch

import main


def setup_module():
    main.load_from_csv()
    main._reset_risk_feature_cache()


def test_statewide_change_summary_is_period_aligned():
    result = main._command_change_summary(30, None)

    assert result["as_of"] == result["current_period"]["end"]
    assert result["window_days"] == 30
    assert result["area_level"] == "district"
    assert len(result["area_changes"]) == 9
    assert {metric["id"] for metric in result["metrics"]} == {
        "cases", "serious_cases", "arrest_rate", "station_spikes",
    }
    assert all(metric["status"] in {"improving", "worsening", "stable"} for metric in result["metrics"])
    magnitudes = [abs(area["percent_change"] or 0) for area in result["area_changes"]]
    assert magnitudes == sorted(magnitudes, reverse=True)
    assert len(result["crime_changes"]) == 9
    assert all(len(row["cells"]) <= 5 for row in result["crime_changes"])


def test_district_change_summary_ranks_stations():
    result = main._command_change_summary(7, 2)

    assert result["scope"] == "Mysuru"
    assert result["area_level"] == "station"
    assert result["area_changes"]
    assert len(result["crime_changes"]) == 1


def test_each_window_uses_distinct_period_totals():
    summaries = {days: main._command_change_summary(days, None) for days in (7, 30, 90)}
    case_totals = {
        days: next(metric["current"] for metric in result["metrics"] if metric["id"] == "cases")
        for days, result in summaries.items()
    }

    assert len(set(case_totals.values())) == 3
    assert case_totals[7] < case_totals[30] < case_totals[90]


def test_resource_allocation_respects_available_fleet():
    result = main._command_change_summary(30, None)
    allocation = result["resource_allocation"]

    assert allocation["available_units"] == len(main._PATROL_BASE)
    assert allocation["allocated_units"] <= allocation["available_units"]
    assert allocation["allocated_units"] == sum(
        recommendation["recommended_units"]
        for recommendation in allocation["recommendations"]
    )
    assert all(
        recommendation["forecast_source"] in {"quickml_pipeline", "local_fallback"}
        and recommendation["anomaly_source"] in {"quickml_pipeline", "local_fallback"}
        for recommendation in allocation["recommendations"]
    )


def test_acp_command_scope_is_enforced_server_side():
    login_request = Mock()
    with patch.object(main, "_try_catalyst_app", return_value=None):
        login = asyncio.run(main.auth_login(
            main.LoginRequest(badge="KSP-ACP-0001", password="acp2026"),
            login_request,
        ))

    session = main.verify_session(login["token"])
    assert login["officer"]["designation"] == "ACP"
    assert session["district_id"] == 1

    request = Mock()
    request.headers = {"Authorization": f"Bearer {login['token']}"}
    with (
        patch.object(main, "_try_catalyst_app", return_value=None),
        patch.object(main, "cache_get", return_value=None),
        patch.object(main, "cache_set"),
    ):
        result = asyncio.run(main.get_command_change_summary(request, 30, 2))

    assert result["scope"] == "Bengaluru Urban"
    assert result["area_level"] == "station"