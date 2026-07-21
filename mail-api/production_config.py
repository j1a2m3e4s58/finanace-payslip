"""Production environment validation without printing secret values."""

from __future__ import annotations

import os
from urllib.parse import urlparse

from cryptography.fernet import Fernet


REQUIRED_SECRETS = (
    "DATA_ENCRYPTION_KEY", "MFA_ENCRYPTION_KEY", "BACKUP_ENCRYPTION_KEY",
    "MAIL_PASSWORD", "DELIVERY_WEBHOOK_SECRET",
)


def enabled(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes"}


def configured(name: str) -> bool:
    return bool(os.getenv(name, "").strip() or os.getenv(f"{name}_FILE", "").strip())


def secret_value(name: str) -> str:
    value = os.getenv(name, "").strip()
    if value:
        return value
    path = os.getenv(f"{name}_FILE", "").strip()
    if not path:
        return ""
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def validate_production_config() -> list[str]:
    errors = []
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url.startswith(("postgresql://", "postgresql+psycopg://", "postgres://")):
        errors.append("DATABASE_URL must use PostgreSQL")
    for name in REQUIRED_SECRETS:
        if not configured(name):
            errors.append(f"{name} is required")
    for name in ("DATA_ENCRYPTION_KEY", "MFA_ENCRYPTION_KEY", "BACKUP_ENCRYPTION_KEY"):
        value = secret_value(name)
        if value:
            try:
                Fernet(value.encode("ascii"))
            except Exception:
                errors.append(f"{name} must be a valid Fernet key")
    encryption_values = [secret_value(name) for name in ("DATA_ENCRYPTION_KEY", "MFA_ENCRYPTION_KEY", "BACKUP_ENCRYPTION_KEY")]
    if all(encryption_values) and len(set(encryption_values)) != len(encryption_values):
        errors.append("Data, MFA, and backup encryption keys must be independent")
    webhook_secret = secret_value("DELIVERY_WEBHOOK_SECRET")
    if webhook_secret and len(webhook_secret) < 32:
        errors.append("DELIVERY_WEBHOOK_SECRET must be at least 32 characters")
    if not enabled("FORCE_HTTPS"):
        errors.append("FORCE_HTTPS must be true")
    if not enabled("REQUIRE_POSTGRESQL"):
        errors.append("REQUIRE_POSTGRESQL must be true")
    if not enabled("REQUIRE_MALWARE_SCANNER"):
        errors.append("REQUIRE_MALWARE_SCANNER must be true")
    if enabled("ALLOW_SELF_REGISTRATION"):
        errors.append("ALLOW_SELF_REGISTRATION must remain false unless formally approved")
    if os.getenv("PAYSLIP_WORKER_MODE", "").strip().lower() != "external":
        errors.append("PAYSLIP_WORKER_MODE must be external")
    if not os.getenv("MALWARE_SCANNER_COMMAND", "").strip():
        errors.append("MALWARE_SCANNER_COMMAND is required")
    if not all(os.getenv(name, "").strip() for name in ("MAIL_SERVER", "MAIL_USERNAME", "MAIL_DEFAULT_SENDER")):
        errors.append("SMTP server, username, and sender are required")
    reset_url = os.getenv("PASSWORD_RESET_BASE_URL", "").strip()
    origins = [item.strip() for item in os.getenv("ALLOWED_ORIGINS", "").split(",") if item.strip()]
    if urlparse(reset_url).scheme != "https":
        errors.append("PASSWORD_RESET_BASE_URL must use HTTPS")
    if not origins or any(origin == "*" or urlparse(origin).scheme != "https" for origin in origins):
        errors.append("ALLOWED_ORIGINS must contain explicit HTTPS origins and no wildcard")
    return errors


def require_production_config() -> None:
    failures = validate_production_config()
    if failures:
        raise RuntimeError("Production configuration failed: " + "; ".join(failures))
