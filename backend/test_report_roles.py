import asyncio
from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException

import main


def setup_module():
    main.load_from_csv()


def request_for(badge: str, password: str) -> Mock:
    with patch.object(main, "_try_catalyst_app", return_value=None):
        login = asyncio.run(main.auth_login(main.LoginRequest(badge=badge, password=password), Mock()))
    request = Mock()
    request.headers = {"Authorization": f"Bearer {login['token']}"}
    return request


def test_reports_require_authentication():
    request = Mock()
    request.headers = {}
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(main.get_reports(request, 20, 0, None, None))
    assert exc_info.value.status_code == 401


def test_acp_reports_are_forced_to_own_district():
    request = request_for("KSP-ACP-0001", "acp2026")
    result = asyncio.run(main.get_reports(request, 20, 0, 2, None))
    assert result["items"]
    assert {item["district"] for item in result["items"]} == {"Bengaluru Urban"}
    assert all(item["detail_level"] == "supervisor" for item in result["items"])


def test_si_reports_are_forced_to_own_station():
    request = request_for("KSP-BLR-4412", "garuda2026")
    result = asyncio.run(main.get_reports(request, 20, 0, 2, 99))
    assert result["items"]
    assert {item["station"] for item in result["items"]} == {"KR Market PS"}


def test_constable_reports_are_station_scoped_and_redacted():
    request = request_for("KSP-BLR-1001", "constable123")
    result = asyncio.run(main.get_reports(request, 20, 0, None, None))
    assert result["items"]
    assert {item["station"] for item in result["items"]} == {"Koramangala PS (Zone 3)"}
    assert all(item["suspects"] is None and item["detail_level"] == "field" for item in result["items"])


def test_constable_cannot_update_workflow_or_view_risk():
    request = request_for("KSP-BLR-1001", "constable123")
    case_id = int(main.DB.cases.iloc[0]["CaseMasterID"])
    with pytest.raises(HTTPException) as workflow_error:
        asyncio.run(main.update_case_workflow(
            case_id,
            main.CaseWorkflowUpdate(status="investigating", assigned_officer="KSP-BLR-1001"),
            request,
        ))
    with pytest.raises(HTTPException) as risk_error:
        asyncio.run(main.predict_case_risk(case_id, request))
    assert workflow_error.value.status_code == 403
    assert risk_error.value.status_code == 403


def test_removed_ci_demo_account_cannot_login():
    with (
        patch.object(main, "_try_catalyst_app", return_value=None),
        pytest.raises(HTTPException) as exc_info,
    ):
        asyncio.run(main.auth_login(
            main.LoginRequest(badge="KSP-BLR-7741", password="sentinel2026"),
            Mock(),
        ))
    assert exc_info.value.status_code == 401