import asyncio
from unittest.mock import Mock, patch

import networkx as nx
import pandas as pd

import main


def test_connection_path_accepts_displayed_person_names():
    suspect_a = "A-1"
    suspect_b = "A-2"
    graph = nx.Graph()
    graph.add_node(suspect_a, type="Suspect", label="Anita Rao")
    graph.add_node(suspect_b, type="Suspect", label="Bharat Shah")
    co_graph = nx.Graph()
    co_graph.add_edge(suspect_a, suspect_b, weight=1, shared_cases=["FIR-1"])
    cases = pd.DataFrame([{
        "CaseMasterID": 1,
        "CrimeRegisteredDate": "2026-01-01",
        "PoliceStationID": 1,
    }])
    request = Mock()

    with (
        patch.object(main, "require_permission"),
        patch.object(main, "ensure_data_loaded", return_value=True),
        patch.object(main, "_require_network_analytics_ready"),
        patch.object(main.DB, "graph", graph),
        patch.object(main.DB, "co_graph", co_graph),
        patch.object(main.DB, "cases", cases),
    ):
        result = asyncio.run(main.get_connection_path(request, "Anita Rao", "Bharat Shah"))

    assert result["connected"] is True
    assert [person["id"] for person in result["path"]] == [suspect_a, suspect_b]
    assert result["hops"][0]["shared_case_count"] == 1


def test_health_prewarms_network_analytics():
    request = Mock()

    def mark_ready(_request):
        main.DB.network_analytics_ready = True

    with (
        patch.object(main.DB, "cases", pd.DataFrame([{"CaseMasterID": 1}])),
        patch.object(main.DB, "network_analytics_ready", False),
        patch.object(main, "_require_network_analytics_ready", side_effect=mark_ready) as prewarm,
    ):
        result = asyncio.run(main.health(request))

    prewarm.assert_called_once_with(request)
    assert result["ready"] is True
    assert result["network_analytics_ready"] is True


def test_health_stays_available_while_network_analytics_compute():
    request = Mock()

    with (
        patch.object(main.DB, "cases", pd.DataFrame([{"CaseMasterID": 1}])),
        patch.object(main.DB, "network_analytics_ready", False),
        patch.object(
            main,
            "_require_network_analytics_ready",
            side_effect=main.HTTPException(503, "still computing"),
        ),
    ):
        result = asyncio.run(main.health(request))

    assert result["status"] == "ok"
    assert result["ready"] is True
    assert result["network_analytics_ready"] is False