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
        "ENFORCE_MAKER_CHECKER": "true",
        "ALLOW_SELF_REGISTRATION": "false",
        "PAYSLIP_WORKER_MODE": "external",
        "MALWARE_SCANNER_COMMAND": "/usr/bin/clamscan",
        "MAIL_SERVER": "smtp.example.invalid",
        "MAIL_PORT": "587",
        "MAIL_SECURITY": "starttls",
        "MAIL_USERNAME": "synthetic-user",
        "MAIL_PASSWORD": "synthetic-password",
        "MAIL_DEFAULT_SENDER": "finance@example.invalid",
        "DELIVERY_WEBHOOK_SECRET": "synthetic-webhook-secret-at-least-32-characters",
        "MONITORING_TOKEN": "synthetic-monitoring-token-at-least-32-characters",
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


def test_production_secret_can_be_loaded_from_mounted_file(tmp_path, monkeypatch):
    secret_file = tmp_path / "mail-password"
    secret_file.write_text("mounted-provider-secret\n", encoding="utf-8")
    monkeypatch.delenv("MAIL_PASSWORD", raising=False)
    monkeypatch.setenv("MAIL_PASSWORD_FILE", str(secret_file))
    assert config.configured("MAIL_PASSWORD") is True
    assert config.secret_value("MAIL_PASSWORD") == "mounted-provider-secret"


def test_production_configuration_rejects_unsafe_mail_and_access_controls(monkeypatch):
    set_ready_environment(monkeypatch)
    monkeypatch.setenv("ENFORCE_MAKER_CHECKER", "false")
    monkeypatch.setenv("MAIL_SECURITY", "none")
    monkeypatch.setenv("MAIL_PORT", "invalid")
    monkeypatch.setenv("MAX_LOGIN_ATTEMPTS", "20")
    monkeypatch.setenv("MONITORING_MAX_STORAGE_PERCENT", "100")
    failures = config.validate_production_config()
    assert any("maker_checker" in item.lower() for item in failures)
    assert any("mail_security" in item.lower() for item in failures)
    assert any("mail_port" in item.lower() for item in failures)
    assert any("max_login_attempts" in item.lower() for item in failures)
    assert any("monitoring_max_storage_percent" in item.lower() for item in failures)


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


def test_readiness_requires_postgresql_and_external_worker(monkeypatch):
    monkeypatch.setattr(portal.DATABASE_STORE, "health", lambda: {"ok": True, "backend": "postgresql"})
    monkeypatch.setattr(portal, "payslip_worker_status", lambda: {"healthy": True, "mode": "external"})
    monkeypatch.setenv("PAYSLIP_WORKER_MODE", "external")
    monkeypatch.delenv("VALIDATE_PRODUCTION_CONFIG", raising=False)
    with portal.app.test_request_context("/api/readiness"):
        response, status = portal.readiness()
    assert status == 200
    assert response.get_json() == {
        "ok": True,
        "database": {"ok": True, "backend": "postgresql"},
        "configuration": {"ok": True},
        "worker": {"ok": True, "mode": "external"},
    }


def test_readiness_fails_closed_when_worker_is_unavailable(monkeypatch):
    monkeypatch.setattr(portal.DATABASE_STORE, "health", lambda: {"ok": True, "backend": "postgresql"})
    monkeypatch.setattr(portal, "payslip_worker_status", lambda: {"healthy": False, "mode": "external"})
    monkeypatch.setenv("PAYSLIP_WORKER_MODE", "external")
    monkeypatch.delenv("VALIDATE_PRODUCTION_CONFIG", raising=False)
    with portal.app.test_request_context("/api/readiness"):
        response, status = portal.readiness()
    assert status == 503
    assert response.get_json()["worker"] == {"ok": False, "mode": "external"}


def test_health_reports_online_only_when_database_and_worker_are_ready(monkeypatch):
    monkeypatch.setattr(portal.DATABASE_STORE, "health", lambda: {"ok": True, "backend": "postgresql"})
    monkeypatch.setattr(portal, "load_json_list_store", lambda _path: [])
    monkeypatch.setattr(portal, "payslip_worker_status", lambda: {"healthy": True, "mode": "external", "lastHeartbeat": 1})
    monkeypatch.setattr(portal, "start_payslip_worker", lambda: None)
    monkeypatch.setenv("PAYSLIP_WORKER_MODE", "external")
    with portal.app.test_request_context("/api/health"):
        response, status = portal.health()
    payload = response.get_json()
    assert status == 200
    assert payload["status"] == "online"
    assert payload["deliveryQueue"]["workerReady"] is True


def test_health_reports_degraded_when_delivery_worker_is_unavailable(monkeypatch):
    monkeypatch.setattr(portal.DATABASE_STORE, "health", lambda: {"ok": True, "backend": "postgresql"})
    monkeypatch.setattr(portal, "load_json_list_store", lambda _path: [{"status": "Pending"}])
    monkeypatch.setattr(portal, "payslip_worker_status", lambda: {"healthy": False, "mode": "external", "lastHeartbeat": 0})
    monkeypatch.setattr(portal, "start_payslip_worker", lambda: None)
    monkeypatch.setenv("PAYSLIP_WORKER_MODE", "external")
    with portal.app.test_request_context("/api/health"):
        response, status = portal.health()
    payload = response.get_json()
    assert status == 200
    assert payload["status"] == "degraded"
    assert payload["deliveryQueue"]["pending"] == 1


def test_health_reports_offline_when_database_is_unavailable(monkeypatch):
    monkeypatch.setattr(portal.DATABASE_STORE, "health", lambda: {"ok": False, "backend": "postgresql"})
    monkeypatch.setattr(portal, "load_json_list_store", lambda _path: [])
    monkeypatch.setattr(portal, "payslip_worker_status", lambda: {"healthy": True, "mode": "external", "lastHeartbeat": 1})
    monkeypatch.setattr(portal, "start_payslip_worker", lambda: None)
    monkeypatch.setenv("PAYSLIP_WORKER_MODE", "external")
    with portal.app.test_request_context("/api/health"):
        response, status = portal.health()
    assert status == 503
    assert response.get_json()["status"] == "offline"


def test_monitoring_status_requires_a_dedicated_token(monkeypatch):
    monkeypatch.setenv("MONITORING_TOKEN", "monitoring-secret-that-is-long-enough")
    with portal.app.test_request_context("/api/monitoring/status"):
        response, status = portal.monitoring_status()
    assert status == 401
    assert "authentication" in response.get_json()["error"].lower()


def test_monitoring_status_reports_operational_dependencies(tmp_path, monkeypatch):
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir()
    (backup_dir / "latest.bcbbackup").write_bytes(b"encrypted-synthetic-backup")
    monkeypatch.setenv("MONITORING_TOKEN", "monitoring-secret-that-is-long-enough")
    monkeypatch.setenv("BACKUP_DIR", str(backup_dir))
    monkeypatch.setattr(portal.DATABASE_STORE, "health", lambda: {"ok": True, "backend": "postgresql"})
    monkeypatch.setattr(portal, "payslip_worker_status", lambda: {"healthy": True, "mode": "external"})
    monkeypatch.setattr(portal, "load_json_list_store", lambda _path: [])
    monkeypatch.setattr(portal.shutil, "disk_usage", lambda _path: type("Usage", (), {"used": 10, "total": 100})())
    with portal.app.test_request_context("/api/monitoring/status", headers={"X-Monitoring-Token": "monitoring-secret-that-is-long-enough"}):
        response, status = portal.monitoring_status()
    payload = response.get_json()
    assert status == 200
    assert payload["status"] == "operational"
    assert all(payload["checks"].values())
