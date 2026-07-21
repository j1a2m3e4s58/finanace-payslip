"""Synthetic storage and payroll-validation load gate.

No real staff or payroll data is read. By default, the drill uses a temporary
SQLite database. Set LOAD_TEST_DATABASE_URL to exercise a staging PostgreSQL
database; the synthetic record is deleted when the drill finishes.
"""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "mail-api"))

from storage import DatabaseStore  # noqa: E402


def synthetic_staff(count: int) -> list[dict]:
    return [
        {
            "id": f"load-staff-{index:05d}",
            "staffId": f"LOAD-{index:05d}",
            "fullName": f"Synthetic Staff {index:05d}",
            "department": ["FINANCE", "IT", "OPERATIONS", "AUDIT"][index % 4],
            "branch": ["HEAD OFFICE", "BAWJIASE", "KASOA MAIN"][index % 3],
            "email": f"load.staff.{index:05d}@example.invalid",
            "employmentStatus": "active" if index % 20 else "inactive",
            "basicSalary": 2500 + (index % 50) * 100,
        }
        for index in range(count)
    ]


def run(count: int, maximum_seconds: float) -> dict:
    url = os.getenv("LOAD_TEST_DATABASE_URL", "").strip()
    with tempfile.TemporaryDirectory(prefix="bcb-load-") as temp_dir:
        if url:
            os.environ["DATABASE_URL"] = url
        else:
            os.environ["DATABASE_URL"] = f"sqlite:///{(Path(temp_dir) / 'load.db').as_posix()}"
        os.environ["REQUIRE_POSTGRESQL"] = "true" if url else "false"
        store = DatabaseStore(temp_dir)
        key = f"synthetic-load-{os.getpid()}-{time.time_ns()}"
        records = synthetic_staff(count)
        started = time.perf_counter()
        try:
            store.save(key, records)
            found, loaded = store.load(key)
            if not found or len(loaded) != count:
                raise RuntimeError("Synthetic staff round trip was incomplete")
            ready = [item for item in loaded if item["employmentStatus"] == "active" and item["email"]]
            departments = {}
            for item in loaded:
                departments[item["department"]] = departments.get(item["department"], 0) + 1
            store.mutate(key, [], lambda rows: (rows, {"ready": len(ready), "departments": departments}))
            elapsed = time.perf_counter() - started
            if elapsed > maximum_seconds:
                raise RuntimeError(f"Load gate exceeded {maximum_seconds:.1f}s: {elapsed:.2f}s")
            return {"backend": store.backend, "staff": count, "ready": len(ready), "seconds": round(elapsed, 3)}
        finally:
            with store.engine.begin() as connection:
                connection.execute(store.documents.delete().where(store.documents.c.store_key == key))
            store.engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--staff-count", type=int, default=2000)
    parser.add_argument("--max-seconds", type=float, default=15)
    args = parser.parse_args()
    if not 100 <= args.staff_count <= 100_000:
        raise SystemExit("--staff-count must be between 100 and 100000")
    result = run(args.staff_count, args.max_seconds)
    print(f"Load gate passed: {result['staff']} synthetic staff, {result['ready']} ready, {result['backend']}, {result['seconds']}s")
