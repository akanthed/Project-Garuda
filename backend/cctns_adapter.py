"""CCTNS/ICJS interoperability adapter — Phase 6 (Tier 2).

Maps Garuda's internal case fields to the field names commonly described in
public documentation of India's Crime and Criminal Tracking Network & Systems
(CCTNS) and the Inter-operable Criminal Justice System (ICJS) FIR data model
(crime number, registering unit, IPC/BNS sections, gravity, dates).

IMPORTANT — this mapping is illustrative, not verified: this project had no
access to the authoritative CCTNS/NCRB data dictionary or a real CCTNS
sandbox. Field names below follow publicly known FIR-record concepts, not a
confirmed CCTNS XML/JSON schema. Before any real integration, this file must
be reviewed against the actual CCTNS Interoperability data dictionary
(available to KSP/NCRB) and the mapping adjusted to match exactly.
"""

from typing import Any

# Garuda internal field -> (CCTNS-style field name, transform)
FIELD_MAP: dict[str, str] = {
    "case_master_id": "InternalCaseRefID",
    "crime_no": "FIRNumber",
    "date": "FIRRegistrationDate",
    "station": "PoliceStationName",
    "district": "DistrictName",
    "crime_type": "OffenceCategory",
    "gravity": "OffenceGravityLevel",
    "ipc_section": "ActsAndSections",
}


def case_to_cctns(case: dict[str, Any]) -> dict[str, Any]:
    """Garuda case dict -> CCTNS-shaped dict, using FIELD_MAP. Unknown/extra
    keys are dropped rather than passed through, so this never leaks
    internal-only fields (e.g. workflow status) into an external export."""
    out = {cctns_key: case[garuda_key] for garuda_key, cctns_key in FIELD_MAP.items() if garuda_key in case}
    out["_schema_note"] = "Illustrative CCTNS-style mapping, not verified against the real NCRB data dictionary."
    return out


def cctns_to_case(record: dict[str, Any]) -> dict[str, Any]:
    """Inverse mapping, for ingesting a CCTNS-shaped record into Garuda's
    internal shape (e.g. a future real-data onboarding pipeline)."""
    reverse = {cctns_key: garuda_key for garuda_key, cctns_key in FIELD_MAP.items()}
    return {reverse[k]: v for k, v in record.items() if k in reverse}
