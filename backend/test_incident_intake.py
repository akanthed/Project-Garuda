import asyncio
from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

import main


def valid_incident(crime_no: str) -> main.IncidentIntakeRequest:
    return main.IncidentIntakeRequest(
        crime_no=crime_no,
        registered_date="2026-06-30",
        police_station_id=1,
        crime_major_head_id=1,
        gravity_offence_id=3,
        latitude=12.9716,
        longitude=77.5946,
        brief_facts="Officer-reviewed incident details.",
    )


def test_fir_number_is_normalized():
    assert valid_incident("  ksp-2026-0001 ").crime_no == "KSP/2026/0001"


def test_invalid_fir_number_is_rejected():
    with pytest.raises(ValidationError, match="configured FIR number format"):
        valid_incident("123")


def test_normalized_duplicate_is_rejected_before_mutation():
    main.load_from_csv()
    existing = str(main.DB.cases.iloc[0]["CrimeNo"])
    duplicate = valid_incident(existing.lower().replace("/", "-"))
    request = Mock()
    request.headers = {"Authorization": f"Bearer {main.sign_session({'badge': 'KSP-DGP-0001', 'clearance': 'CLR-7'})}"}
    original_count = len(main.DB.cases)

    with patch.object(main, "ensure_data_loaded", return_value=True):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(main.create_incident(duplicate, request))

    assert exc_info.value.status_code == 409
    assert len(main.DB.cases) == original_count