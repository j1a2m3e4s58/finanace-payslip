"""Fail-fast production configuration gate; secret values are never printed."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "mail-api"))
from production_config import validate_production_config  # noqa: E402


if __name__ == "__main__":
    failures = validate_production_config()
    if failures:
        print("Production configuration is not ready:")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(1)
    print("Production configuration gate passed without exposing secret values.")
