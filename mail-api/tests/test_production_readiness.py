from __future__ import annotations

import sys
from pathlib import Path

from cryptography.fernet import Fernet


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "mail-api"))
import production_config as config
import app as portal


def set_ready_environment(monkeypatch):
    values = {
        "DATABASE_URL": "postgresql+psycopg://user:password@database:5432/bcb_payslip_staging",
        "FORCE_HTTPS": "true",
        "REQUIRE_POSTGRESQL": "true",
        "REQUIRE_MALWARE_SCANNER": "true",
        "ALLOW_SELF_REGISTRATION": "false",
        "PAYSLIP_WORKER_MODE": "external",
        "MALWARE_SCANNER_COMMAND": "/usr/bin/clamscan",
        "MAIL_SERVER": "smtp.example.invalid",
        "MAIL_USERNAME": "synthetic-user",
        "MAIL_PASSWORD": "synthetic-password",
        "MAIL_DEFAULT_SENDER": "finance@example.invalid",
        "DELIVERY_WEBHOOK_SECRET": "synthetic-webhook-secret-at-least-32-characters",
        "PASSWORD_RESET_BASE_URL": "https://staging.example.invalid/reset-password",
        "ALLOWED_ORIGINS": "https://staging.example.invalid",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    for name in ("DATA_ENCRYPTION_KEY", "MFA_ENCRYPTION_KEY", "BACKUP_ENCRYPTION_KEY"):
        monkeypatch.setenv(name, Fernet.generate_key().decode("ascii"))


def test_production_configuration_gate_accepts_hardened_environment(monkeypatch):
    set_ready_environment(monkeypatch)
    assert config.validate_production_config() == []


def test_production_configuration_gate_blocks_unsafe_defaults(monkeypatch):
    set_ready_environment(monkeypatch)
    monkeypatch.setenv("ALLOW_SELF_REGISTRATION", "true")
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")
    monkeypatch.setenv("FORCE_HTTPS", "false")
    failures = config.validate_production_config()
    assert any("self_registration" in item.lower() for item in failures)
    assert any("origins" in item.lower() for item in failures)
    assert any("force_https" in item.lower() for item in failures)


def test_production_configuration_requires_independent_encryption_keys(monkeypatch):
    set_ready_environment(monkeypatch)
    shared = Fernet.generate_key().decode("ascii")
    monkeypatch.setenv("DATA_ENCRYPTION_KEY", shared)
    monkeypatch.setenv("MFA_ENCRYPTION_KEY", shared)
    failures = config.validate_production_config()
    assert any("independent" in item.lower() for item in failures)


def test_render_blueprint_keeps_public_registration_disabled():
    blueprint = (ROOT / "render.yaml").read_text(encoding="utf-8")
    assert "- key: ALLOW_SELF_REGISTRATION\n        value: \"false\"" in blueprint


def test_public_registration_is_disabled_by_default(monkeypatch):
    monkeypatch.delenv("ALLOW_SELF_REGISTRATION", raising=False)
    assert portal.self_registration_enabled() is False


def test_api_responses_apply_security_and_trace_headers():
    with portal.app.test_request_context(
        "/api/health",
        headers={"X-Forwarded-Proto": "https", "X-Request-ID": "readiness-test"},
    ):
        portal.g.request_id = "readiness-test"
        portal.g.request_started = portal.time.perf_counter()
        response = portal.add_cors_headers(portal.jsonify({"ok": True}))
    assert response.headers["X-Request-ID"] == "readiness-test"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
    assert response.headers["Strict-Transport-Security"].startswith("max-age=31536000")
    assert "no-store" in response.headers["Cache-Control"]
