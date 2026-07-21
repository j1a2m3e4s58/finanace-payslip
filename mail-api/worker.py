"""Dedicated durable payslip delivery worker for production deployments."""

import os
import time

from production_config import require_production_config

if os.getenv("VALIDATE_PRODUCTION_CONFIG", "").strip().lower() in {"1", "true", "yes"}:
    require_production_config()

from app import start_payslip_worker


if __name__ == "__main__":
    start_payslip_worker(force=True)
    while True:
        time.sleep(60)
