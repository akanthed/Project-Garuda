"""Karnataka district/station reference data — additive statewide expansion.

Bengaluru Urban (district_id=1) owns the original 100 stations and every
existing case/accused/arrest row untouched. Each additional district below
reserves its own PoliceStationID range and a real-world-approximate bounding
box so new synthetic data stays geographically coherent per district instead
of relabeling existing Bengaluru coordinates.

DISTRICTS is the single source of truth for:
  - station_id -> district lookup (station_of_district / district_of_station)
  - station display names (station_name)
  - map bounds for statewide/district drilldown fitting
"""

from bisect import bisect_right


class District:
    __slots__ = ("district_id", "name", "code", "centroid", "bounds", "station_start", "station_end", "localities")

    def __init__(self, district_id: int, name: str, code: str, centroid: tuple[float, float],
                 bounds: tuple[float, float, float, float], station_start: int, station_end: int,
                 localities: list[str]):
        self.district_id = district_id
        self.name = name
        self.code = code
        self.centroid = centroid          # (lat, lng)
        self.bounds = bounds              # (min_lat, max_lat, min_lng, max_lng)
        self.station_start = station_start
        self.station_end = station_end
        self.localities = localities


# Bengaluru Urban keeps its original bounding box (generate_data.py /
# scale_data.py) and station IDs 1-100 exactly as already deployed.
DISTRICTS: list[District] = [
    District(1, "Bengaluru Urban", "BLR", (12.9716, 77.5946), (12.80, 13.10, 77.40, 77.75), 1, 100, [
        "KR Market", "MG Road", "Whitefield", "Koramangala", "Hebbal",
        "Jayanagar", "Malleshwaram", "Yelahanka", "Electronic City",
        "HSR Layout", "BTM Layout", "Bannerghatta Road", "Mysuru Road",
        "Indiranagar", "Rajajinagar", "Yeshwantpur", "Marathahalli",
        "Silk Board", "Basavanagudi", "RT Nagar",
    ]),
    District(2, "Mysuru", "MYS", (12.2958, 76.6394), (12.15, 12.45, 76.50, 76.80), 101, 108, [
        "Mysuru City", "Nazarbad", "Jayalakshmipuram", "Vijayanagar Mysuru",
        "Kuvempunagar", "Chamundi Hill Road", "Hebbal Mysuru", "Bogadi",
    ]),
    District(3, "Dakshina Kannada", "DK", (12.9141, 74.8560), (12.75, 13.05, 74.75, 75.05), 109, 116, [
        "Mangaluru City", "Kadri", "Bejai", "Surathkal",
        "Ullal", "Kankanady", "Bunder", "Panambur",
    ]),
    District(4, "Belagavi", "BGM", (15.8497, 74.4977), (15.70, 16.00, 74.35, 74.65), 117, 124, [
        "Belagavi City", "Tilakwadi", "Camp Belagavi", "Shahapur",
        "Vadgaon", "Angol", "Khasbag", "Nehru Nagar Belagavi",
    ]),
    District(5, "Kalaburagi", "GLB", (17.3297, 76.8343), (17.20, 17.50, 76.70, 77.00), 125, 132, [
        "Kalaburagi City", "Sedam Road", "Jewargi Colony", "Ashok Nagar Kalaburagi",
        "Station Bazaar", "Aiwan-E-Shahi", "Ramnagar Kalaburagi", "Brahmapur",
    ]),
    District(6, "Ballari", "BLY", (15.1394, 76.9214), (15.00, 15.30, 76.80, 77.10), 133, 140, [
        "Ballari City", "Cowl Bazaar", "Gandhinagar Ballari", "Bruce Pet",
        "Hospet Road", "Kappagal Road", "Vidyanagar Ballari", "Sandur Road",
    ]),
    District(7, "Tumakuru", "TMK", (13.3379, 77.1173), (13.20, 13.50, 77.00, 77.30), 141, 148, [
        "Tumakuru City", "Kunigal Road", "Batawadi", "Ashoknagar Tumakuru",
        "SS Puram", "Mandipet", "Amanikere", "Antharasanahalli",
    ]),
    District(8, "Dharwad", "DWD", (15.3647, 75.1240), (15.25, 15.50, 75.00, 75.30), 149, 156, [
        "Hubballi City", "Dharwad City", "Vidyanagar Hubballi", "Keshwapur",
        "Gokul Road", "Navanagar Hubballi", "Unkal", "Saptapur",
    ]),
    District(9, "Udupi", "UDP", (13.3409, 74.7421), (13.20, 13.50, 74.65, 74.90), 157, 164, [
        "Udupi City", "Manipal", "Malpe", "Kaup",
        "Kalyanpur", "Brahmagiri", "Ambalpady", "Kunjibettu",
    ]),
]

STATION_ID_MIN = DISTRICTS[0].station_start
STATION_ID_MAX = DISTRICTS[-1].station_end

# Sorted station_start values for O(log n) district_of_station lookups.
_STARTS = [d.station_start for d in DISTRICTS]


def all_districts() -> list[District]:
    return DISTRICTS


def district_of_station(station_id: int) -> District:
    """Map any known station_id (1..STATION_ID_MAX) to its District."""
    idx = bisect_right(_STARTS, station_id) - 1
    idx = max(0, min(idx, len(DISTRICTS) - 1))
    d = DISTRICTS[idx]
    if station_id < d.station_start or station_id > d.station_end:
        # Out-of-range station_id (e.g. legacy modulo data) — attribute to Bengaluru Urban.
        return DISTRICTS[0]
    return d


def district_by_id(district_id: int) -> District | None:
    for d in DISTRICTS:
        if d.district_id == district_id:
            return d
    return None


def station_name(station_id: int) -> str:
    d = district_of_station(station_id)
    offset = station_id - d.station_start
    locality = d.localities[offset % len(d.localities)]
    zone = offset // len(d.localities) + 1
    return f"{locality} PS" if zone == 1 else f"{locality} PS (Zone {zone})"


def statewide_bounds() -> tuple[float, float, float, float]:
    """(min_lat, max_lat, min_lng, max_lng) across all districts."""
    lats_min = min(d.bounds[0] for d in DISTRICTS)
    lats_max = max(d.bounds[1] for d in DISTRICTS)
    lngs_min = min(d.bounds[2] for d in DISTRICTS)
    lngs_max = max(d.bounds[3] for d in DISTRICTS)
    return (lats_min, lats_max, lngs_min, lngs_max)
