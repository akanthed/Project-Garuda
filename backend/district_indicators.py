"""Synthetic district-level socio-economic indicators — Phase 6 (Tier 2)
correlation workbench.

NOT real data. No verified public Karnataka district indicator dataset was
integrated in this session — a web lookup for real per-district population
figures did not return clean structured data worth citing, so these values
are honestly labeled synthetic placeholders rather than presented as real
statistics with a shaky source. Seeded per district_id so values are stable
across restarts, following the same pattern as _station_factors() in main.py.

Replacing this module with real, cited public indicators (e.g. Census/NCRB)
is a drop-in change — the correlation endpoint in main.py only calls
indicators_for_district() and does not care where the numbers come from.
"""

import random


def indicators_for_district(district_id: int) -> dict:
    rng = random.Random(5000 + district_id)
    return {
        "literacy_rate_percent": round(rng.uniform(65, 88), 1),
        "unemployment_rate_percent": round(rng.uniform(3, 14), 1),
        "urbanization_percent": round(rng.uniform(20, 95), 1),
        "provenance": "synthetic_placeholder",
    }
