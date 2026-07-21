import os

from production_config import require_production_config

if os.getenv("VALIDATE_PRODUCTION_CONFIG", "").strip().lower() in {"1", "true", "yes"}:
    require_production_config()

from app import app  # noqa: E402


application = app
