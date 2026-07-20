"""Resume-safe uploader for the protected AppSail Data Store seed endpoint.

$env:SEED_TOKEN = "..."
python upload_data.py --base-url https://your-app.catalystappsail.in
"""

import argparse
import csv
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
MANIFEST_PATH = DATA_DIR / "scale_manifest.json"
CHECKPOINT_PATH = DATA_DIR / ".upload_checkpoint.json"
TABLES = ("CaseMaster", "Accused", "ArrestSurrender")


def post_chunk(base_url: str, token: str, table: str, offset: int, rows: list[dict]) -> dict:
    body = json.dumps({"table": table, "offset": offset, "rows": rows}).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/admin/seed-datastore",
        data=body,
        headers={"Content-Type": "application/json", "X-Seed-Token": token},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def read_rows(table: str, offset: int, limit: int) -> list[dict]:
    path = DATA_DIR / f"{table}.csv"
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = []
        for index, row in enumerate(reader):
            if index < offset:
                continue
            if len(rows) >= limit:
                break
            rows.append({key: value for key, value in row.items() if value != ""})
        return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--chunk-size", type=int, default=200, choices=range(1, 2001), metavar="1..2000")
    parser.add_argument("--reset-checkpoint", action="store_true")
    args = parser.parse_args()
    token = os.environ.get("SEED_TOKEN", "").strip()
    if not token:
        raise SystemExit("Set SEED_TOKEN in this terminal before running the uploader.")
    if not MANIFEST_PATH.exists():
        raise SystemExit("Run scale_data.py first; scale_manifest.json is missing.")

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    starts = manifest["original_rows"]
    checkpoint = {} if args.reset_checkpoint or not CHECKPOINT_PATH.exists() else json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))

    for table in TABLES:
        offset = int(checkpoint.get(table, starts[table]))
        total = int(manifest["total_rows"][table])
        while offset < total:
            rows = read_rows(table, offset, min(args.chunk_size, total - offset))
            if not rows:
                raise SystemExit(f"{table} ended before manifest total {total} at offset {offset}.")
            try:
                result = post_chunk(args.base_url, token, table, offset, rows)
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                raise SystemExit(f"{table} failed at offset {offset}: HTTP {exc.code} {detail}") from exc
            offset = int(result["next_offset"])
            checkpoint[table] = offset
            CHECKPOINT_PATH.write_text(json.dumps(checkpoint, indent=2), encoding="utf-8")
            print(f"{table}: {offset:,}/{total:,}")
            time.sleep(0.05)

    print("Upload complete. Call POST /api/admin/reload-from-datastore, then verify /health.")


if __name__ == "__main__":
    main()
