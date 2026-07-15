"""Dedicated durable payslip delivery worker for production deployments."""

import time

from app import start_payslip_worker


if __name__ == "__main__":
    start_payslip_worker(force=True)
    while True:
        time.sleep(60)
