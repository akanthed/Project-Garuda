"""
Project Garuda — self-contained concurrency load test (Phase 7).

Boots the backend as a subprocess (timing cold start), then fires 10/50/100
concurrent simulated-officer request bursts at it (a mix of endpoints mirroring
real dashboard usage), recording p50/p95/p99 latency, throughput, error rate,
and server process RSS memory at each level. Tears the subprocess down at the
end. This proves prototype-scale concurrency handling on a single AppSail-class
instance — it does NOT certify production capacity at real scale (see
docs/THREAT_MODEL.md / docs/PRODUCTION_ROADMAP.md for that distinction).

Usage:
    python load_test.py [--levels 10,50,100] [--requests-per-user 5]

Requires `requests` + `psutil` (installed in backend/.venv-test for this
dev-only tool; not vendored for AppSail, since main.py itself never imports
either).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field

import psutil
import requests

DEMO_BADGE = "KSP-DGP-0001"
DEMO_PASSWORD = "dgp2026"
PORT = "8099"
BASE_URL = f"http://localhost:{PORT}"


@dataclass
class RequestResult:
    endpoint: str
    status: int
    latency_ms: float
    error: str | None = None


@dataclass
class EndpointStats:
    endpoint: str
    count: int = 0
    errors: int = 0
    latencies_ms: list = field(default_factory=list)


class MemorySampler:
    """Polls a process tree's total RSS in a background thread while a block of
    code runs. Includes child processes: this venv's python.exe launches a
    lightweight parent (~4MB) that spawns the actual uvicorn worker as a CHILD
    process (confirmed empirically — uvicorn logs "Started server process
    [<child pid>]" even with reload disabled), so the parent PID alone
    dramatically understates real memory usage.
    """

    def __init__(self, pid: int, interval_s: float = 0.2):
        self.proc = psutil.Process(pid)
        self.interval_s = interval_s
        self.samples_mb: list[float] = []
        self.sample_error: str | None = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _tree_rss_mb(self) -> float:
        total = 0
        for proc in [self.proc, *self.proc.children(recursive=True)]:
            try:
                total += proc.memory_info().rss
            except psutil.Error:
                pass
        return total / (1024 * 1024)

    def _run(self):
        while not self._stop.is_set():
            try:
                self.samples_mb.append(self._tree_rss_mb())
            except psutil.Error as exc:
                self.sample_error = str(exc)
                break
            self._stop.wait(self.interval_s)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._thread.join(timeout=2)

    def summary(self) -> dict:
        if not self.samples_mb:
            return {"min_mb": None, "max_mb": None, "avg_mb": None, "samples": 0, "error": self.sample_error}
        return {
            "min_mb": round(min(self.samples_mb), 1),
            "max_mb": round(max(self.samples_mb), 1),
            "avg_mb": round(sum(self.samples_mb) / len(self.samples_mb), 1),
            "samples": len(self.samples_mb),
        }


def start_server() -> tuple[subprocess.Popen, dict]:
    """Boot main.py as a subprocess, timing until /health first reports ready."""
    env = dict(os.environ)
    env.pop("PYTHONPATH", None)  # vendor/ is Linux-only; use the venv's own site-packages
    env["X_ZOHO_CATALYST_LISTEN_PORT"] = PORT
    # Throwaway secret so Phase 7's fail-fast startup check doesn't reject this
    # measurement run for using the placeholder default under simulated AppSail mode.
    env["SESSION_SECRET"] = "load-test-throwaway-secret-not-for-prod"
    # This test drives all simulated "users" from one machine (one source IP),
    # which would otherwise trip the per-IP abuse guard almost immediately —
    # a different signal than genuine per-user request volume in production
    # (many distinct officer IPs). Raise it for this measurement run only.
    env["RATE_LIMIT_MAX_REQUESTS"] = "100000"

    backend_dir = os.path.dirname(os.path.abspath(__file__))
    python_exe = os.path.join(backend_dir, ".venv-test", "Scripts", "python.exe")
    if not os.path.exists(python_exe):
        python_exe = sys.executable

    start = time.monotonic()
    proc = subprocess.Popen([python_exe, "main.py"], cwd=backend_dir, env=env,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ready_at = None
    while time.monotonic() - start < 60:
        try:
            r = requests.get(f"{BASE_URL}/health", timeout=1)
            if r.status_code == 200 and r.json().get("ready"):
                ready_at = time.monotonic()
                break
        except requests.RequestException:
            pass
        time.sleep(0.25)

    cold_start = {"cold_start_seconds": round(ready_at - start, 2) if ready_at else None,
                  "timed_out": ready_at is None}
    return proc, cold_start


def login() -> str:
    resp = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"badge": DEMO_BADGE, "password": DEMO_PASSWORD}, timeout=10)
    resp.raise_for_status()
    return resp.json()["token"]


def endpoint_plan(token: str) -> list[tuple[str, str, dict]]:
    """(method, path, extra_kwargs) — a mix mirroring real dashboard traffic."""
    auth = {"headers": {"Authorization": f"Bearer {token}"}}
    return [
        ("GET", "/health", {}),
        ("GET", "/api/kpis", {}),
        ("GET", "/api/hotspots", {}),
        ("GET", "/api/districts", {}),
        ("GET", "/api/anomalies", {}),
        ("GET", "/api/network/kingpins", auth),
        ("GET", "/api/network/communities?max_size=30", auth),
    ]


def fire_one(method: str, path: str, kwargs: dict) -> RequestResult:
    url = f"{BASE_URL}{path}"
    t0 = time.monotonic()
    try:
        resp = requests.request(method, url, timeout=15, **kwargs)
        latency_ms = (time.monotonic() - t0) * 1000
        return RequestResult(endpoint=path, status=resp.status_code, latency_ms=latency_ms,
                              error=None if resp.status_code < 400 else f"HTTP {resp.status_code}")
    except requests.RequestException as exc:
        latency_ms = (time.monotonic() - t0) * 1000
        return RequestResult(endpoint=path, status=0, latency_ms=latency_ms, error=str(exc))


def pctile(data: list, p: float) -> float:
    if not data:
        return 0.0
    idx = min(len(data) - 1, int(len(data) * p))
    return round(data[idx], 1)


def run_level(pid: int, concurrency: int, requests_per_user: int, plan: list) -> dict:
    jobs = [(m, p, k) for _ in range(concurrency) for m, p, k in plan for _ in range(requests_per_user)]

    results: list[RequestResult] = []
    with MemorySampler(pid) as mem:
        wall_start = time.monotonic()
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            futures = [pool.submit(fire_one, m, p, k) for m, p, k in jobs]
            for fut in as_completed(futures):
                results.append(fut.result())
        wall_seconds = time.monotonic() - wall_start
    mem_summary = mem.summary()

    per_endpoint: dict[str, EndpointStats] = {}
    for r in results:
        stat = per_endpoint.setdefault(r.endpoint, EndpointStats(endpoint=r.endpoint))
        stat.count += 1
        stat.latencies_ms.append(r.latency_ms)
        if r.error:
            stat.errors += 1

    all_latencies = sorted(r.latency_ms for r in results)
    total_errors = sum(1 for r in results if r.error)

    return {
        "concurrency": concurrency,
        "total_requests": len(results),
        "wall_seconds": round(wall_seconds, 2),
        "throughput_rps": round(len(results) / wall_seconds, 2) if wall_seconds > 0 else None,
        "error_rate_percent": round(100 * total_errors / len(results), 2) if results else None,
        "p50_ms": pctile(all_latencies, 0.50),
        "p95_ms": pctile(all_latencies, 0.95),
        "p99_ms": pctile(all_latencies, 0.99),
        "max_ms": round(max(all_latencies), 1) if all_latencies else None,
        "server_memory_rss": mem_summary,
        "per_endpoint": {
            ep: {"count": s.count, "errors": s.errors,
                 "p50_ms": pctile(sorted(s.latencies_ms), 0.50),
                 "p95_ms": pctile(sorted(s.latencies_ms), 0.95)}
            for ep, s in per_endpoint.items()
        },
        "sample_errors": [f"{r.endpoint}: {r.error}" for r in results if r.error][:5],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--levels", default="10,50,100")
    parser.add_argument("--requests-per-user", type=int, default=5)
    args = parser.parse_args()
    levels = [int(x) for x in args.levels.split(",")]

    print(f"Starting backend subprocess on {BASE_URL} ...")
    proc, cold_start = start_server()
    print(f"  cold start: {cold_start}")
    if cold_start["timed_out"]:
        print("Server never became ready — aborting.")
        proc.terminate()
        sys.exit(1)

    try:
        token = login()
        plan = endpoint_plan(token)
        report: dict = {
            "target": BASE_URL,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "endpoints_tested": [p for _, p, _ in plan],
            "cold_start": cold_start,
            "levels": [],
        }
        for level in levels:
            n = level * len(plan) * args.requests_per_user
            print(f"Running concurrency={level} ({n} requests) ...")
            level_report = run_level(proc.pid, level, args.requests_per_user, plan)
            report["levels"].append(level_report)
            print(f"  -> p50={level_report['p50_ms']}ms p95={level_report['p95_ms']}ms "
                  f"p99={level_report['p99_ms']}ms throughput={level_report['throughput_rps']}req/s "
                  f"errors={level_report['error_rate_percent']}% "
                  f"mem_max={level_report['server_memory_rss']['max_mb']}MB")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "load_test_report.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"Report written to {out_path}")


if __name__ == "__main__":
    main()
