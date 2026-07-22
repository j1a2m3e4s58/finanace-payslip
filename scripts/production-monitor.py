"""Check the protected production monitoring endpoint without exposing secrets."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def main() -> None:
    base_url = required("PRODUCTION_BASE_URL").rstrip("/")
    parsed = urlparse(base_url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise RuntimeError("PRODUCTION_BASE_URL must be an HTTPS URL without embedded credentials")
    token = required("PRODUCTION_MONITORING_TOKEN")
    request = Request(
        f"{base_url}/api/monitoring/status",
        headers={"Accept": "application/json", "X-Monitoring-Token": token},
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read() or b"{}")
            status_code = response.status
    except HTTPError as exc:
        status_code = exc.code
        try:
            payload = json.loads(exc.read() or b"{}")
        except json.JSONDecodeError:
            payload = {}
    except URLError as exc:
        raise RuntimeError("The production monitoring endpoint could not be reached") from exc

    checks = payload.get("checks") if isinstance(payload.get("checks"), dict) else {}
    safe_report = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "httpStatus": status_code,
        "status": payload.get("status", "unavailable"),
        "checks": {str(name): bool(value) for name, value in checks.items()},
        "delivery": payload.get("delivery", {}),
        "storage": payload.get("storage", {}),
        "backup": payload.get("backup", {}),
    }
    report_path = Path(os.getenv("MONITORING_REPORT_PATH", "production-monitoring-report.json"))
    report_path.write_text(json.dumps(safe_report, indent=2, sort_keys=True), encoding="utf-8")
    failed_checks = sorted(name for name, passed in safe_report["checks"].items() if not passed)
    if status_code != 200 or payload.get("ok") is not True or failed_checks:
        summary = ", ".join(failed_checks) if failed_checks else f"HTTP {status_code}"
        raise RuntimeError(f"Production monitoring requires attention: {summary}")
    print("Production API, database, worker, delivery queue, storage, and backup checks passed")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, TypeError, json.JSONDecodeError) as exc:
        print(f"Production monitoring failed safely: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
