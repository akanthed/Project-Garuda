"""Focused tests for the ActionLoop response-plan lifecycle."""

from unittest.mock import Mock

import pytest
from fastapi import HTTPException

import main


@pytest.fixture(autouse=True)
def clear_operations():
    main._LOCAL_RESPONSE_PLANS.clear()
    main._LOCAL_FIELD_UPDATES.clear()
    main._LOCAL_OPERATION_ATTACHMENTS.clear()
    yield
    main._LOCAL_RESPONSE_PLANS.clear()
    main._LOCAL_FIELD_UPDATES.clear()
    main._LOCAL_OPERATION_ATTACHMENTS.clear()


def create_body(assigned_to: str = "KSP-BLR-1001") -> main.ResponsePlanCreate:
    return main.ResponsePlanCreate(
        alert_id="ANOM-1",
        station_id=1,
        current_count=9,
        usual_count=4.1,
        z_score=2.4,
        decision="approve",
        note="Verify the evening theft increase.",
        assigned_to=assigned_to,
    )


def test_create_response_plan_records_assignment():
    result = main._create_response_plan(
        create_body(), {"badge": "KSP-DGP-0001", "clearance": "CLR-7"}
    )

    assert result["assigned_to"] == "KSP-BLR-1001"
    assert result["status"] == "assigned"
    assert result["station_name"]
    assert result["persistence"] == "session"


def test_create_response_plan_rejects_unknown_officer():
    with pytest.raises(HTTPException) as exc:
        main._create_response_plan(
            create_body("KSP-UNKNOWN-1"),
            {"badge": "KSP-DGP-0001", "clearance": "CLR-7"},
        )

    assert exc.value.status_code == 422


def test_assignee_can_progress_response_plan():
    plan = main._create_response_plan(
        create_body(), {"badge": "KSP-DGP-0001", "clearance": "CLR-7"}
    )

    result = main._update_response_plan(
        plan["operation_id"],
        main.ResponsePlanUpdate(status="completed", outcome_note="Patrol completed."),
        {"badge": "KSP-BLR-1001", "clearance": "CLR-1"},
    )

    assert result["status"] == "completed"
    assert result["outcome_note"] == "Patrol completed."
    assert [update["status"] for update in result["updates"]] == ["assigned", "completed"]


def test_unassigned_constable_cannot_update_response_plan():
    plan = main._create_response_plan(
        create_body(), {"badge": "KSP-DGP-0001", "clearance": "CLR-7"}
    )

    with pytest.raises(HTTPException) as exc:
        main._update_response_plan(
            plan["operation_id"],
            main.ResponsePlanUpdate(status="acknowledged"),
            {"badge": "KSP-BLR-9999", "clearance": "CLR-1"},
        )

    assert exc.value.status_code == 403


def test_datastore_insert_uses_response_plans_table():
    table = Mock()
    table.insert_row.return_value = {"ROWID": "9001"}
    datastore = Mock()
    datastore.table.return_value = table
    capp = Mock()
    capp.datastore.return_value = datastore

    result = main._create_response_plan(
        create_body(), {"badge": "KSP-DGP-0001", "clearance": "CLR-7"}, capp
    )

    datastore.table.assert_any_call("ResponsePlans")
    datastore.table.assert_any_call("FieldUpdates")
    assert result["persistence"] == "datastore"


def test_hydrate_response_plans_restores_datastore_rows():
    table = Mock()
    table.get_iterable_rows.return_value = [{
        "ROWID": "9001",
        "OperationID": "operation-1",
        "AlertID": "ANOM-1",
        "StationID": "1",
        "StationName": "Koramangala PS",
        "CurrentCount": "9",
        "UsualCount": "4.1",
        "ZScore": "2.4",
        "Decision": "approve",
        "Note": "Verify patrol coverage.",
        "AssignedTo": "KSP-BLR-1001",
        "Status": "assigned",
        "CreatedBy": "KSP-DGP-0001",
        "CreatedAt": "2026-08-24T10:00:00+00:00",
        "DueAt": "",
        "UpdatedAt": "2026-08-24T10:00:00+00:00",
        "OutcomeNote": "",
    }]
    datastore = Mock()
    datastore.table.return_value = table
    capp = Mock()
    capp.datastore.return_value = datastore

    main._hydrate_response_plans(capp)

    assert main._LOCAL_RESPONSE_PLANS["operation-1"]["station_id"] == 1
    assert main._LOCAL_RESPONSE_PLANS["operation-1"]["persistence"] == "datastore"


def test_operation_assessment_does_not_claim_early_impact():
    plan = main._create_response_plan(
        create_body(), {"badge": "KSP-DGP-0001", "clearance": "CLR-7"}
    )
    assessment = main._operation_assessment(plan)

    assert assessment["impact_status"] == "pending_observation_window"
    assert "not attributed" in assessment["advisory"]


def test_field_update_uses_datastore_table():
    field_table = Mock()
    field_table.insert_row.return_value = {"ROWID": "8001"}
    response_table = Mock()
    response_table.insert_row.return_value = {"ROWID": "9001"}
    datastore = Mock()
    datastore.table.side_effect = lambda name: field_table if name == "FieldUpdates" else response_table
    capp = Mock()
    capp.datastore.return_value = datastore

    result = main._create_response_plan(
        create_body(), {"badge": "KSP-DGP-0001", "clearance": "CLR-7"}, capp
    )

    assert result["updates"][0]["persistence"] == "datastore"
    field_table.insert_row.assert_called_once()


def test_assessment_snapshot_uses_datastore_table():
    table = Mock()
    datastore = Mock()
    datastore.table.return_value = table
    capp = Mock()
    capp.datastore.return_value = datastore
    plan = main._create_response_plan(
        create_body(), {"badge": "KSP-DGP-0001", "clearance": "CLR-7"}
    )

    persistence = main._persist_operation_assessment(
        main._operation_assessment(plan), "KSP-DGP-0001", capp
    )

    datastore.table.assert_called_with("Assessments")
    assert persistence == "datastore"


def test_maintenance_snapshots_completed_operations():
    plan = main._create_response_plan(
        create_body(), {"badge": "KSP-DGP-0001", "clearance": "CLR-7"}
    )
    main._update_response_plan(
        plan["operation_id"], main.ResponsePlanUpdate(status="completed"),
        {"badge": "KSP-BLR-1001", "clearance": "CLR-1"},
    )

    result = main._run_operation_maintenance()

    assert result["completed_operations"] == 1
    assert result["pending_observation_window"] == 1


def test_signal_delivery_is_sanitized():
    event = main._record_signal_delivery({
        "OperationID": "operation-1", "Status": "assigned", "StationID": 1,
        "raw_sensitive_note": "must not be copied",
    })

    assert event["operation_id"] == "operation-1"
    assert event["action"] == "signal_received"
    assert "raw_sensitive_note" not in event


def test_job_scheduling_setup_is_idempotent(monkeypatch):
    monkeypatch.setenv("JOB_SCHEDULER_TOKEN", "job-secret")
    scheduler = Mock()
    scheduler.get_all_jobpool.return_value = [{"id": "pool-1", "name": "GarudaAnalytics"}]
    scheduler.cron.get_all.return_value = [{"id": "cron-1", "cron_name": "GarudaOpsMaintenance"}]
    capp = Mock()
    capp.job_scheduling.return_value = scheduler

    result = main._ensure_operation_maintenance_cron(capp)

    assert result == {"created": False, "cron_id": "cron-1", "cron_name": "GarudaOpsMaintenance"}
    scheduler.cron.create.assert_not_called()