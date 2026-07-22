"""Render pre-deploy gate for production configuration and PostgreSQL schema."""

from __future__ import annotations

import os

from production_config import require_production_config
from storage import DatabaseStore


def main() -> None:
    require_production_config()
    data_dir = os.getenv("PORTAL_DATA_DIR", "/tmp/bcb-predeploy")
    store = DatabaseStore(data_dir)
    try:
        health = store.health()
        if health != {"ok": True, "backend": "postgresql"}:
            raise RuntimeError("PostgreSQL migration health verification failed")
        print("Production configuration and PostgreSQL schema gate passed")
    finally:
        store.engine.dispose()


if __name__ == "__main__":
    main()
