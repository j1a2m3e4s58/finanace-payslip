from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]


def load_script(name: str):
    path = ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), path)
    if not spec or not spec.loader:
        raise RuntimeError(f"Unable to load {name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_staging_totp_matches_rfc_vector():
    staging = load_script("staging-smoke.py")
    assert staging.totp_code("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", timestamp=59) == "287082"


def test_staging_email_workflow_fails_before_network_without_confirmation(monkeypatch):
    delivery = load_script("staging-payroll-delivery.py")
    assert "Sent" not in delivery.PROVIDER_FINAL_STATUSES
    monkeypatch.setenv("STAGING_EMAIL_CONFIRMATION", "not authorized")
    with pytest.raises(RuntimeError, match="confirmation"):
        delivery.main()


def test_recovery_drill_rejects_production_database_name(monkeypatch):
    recovery = load_script("postgres-recovery-drill.py")
    monkeypatch.setenv("TEST_POSTGRES_DATABASE_URL", "postgresql://user:password@database/bcb_payslip_production")
    with pytest.raises(SystemExit, match="restricted"):
        recovery.main()


def test_approved_staging_workflows_are_manual_and_environment_gated():
    for name in ("staging-acceptance.yml", "staging-email-acceptance.yml", "staging-recovery-drill.yml"):
        workflow = (ROOT / ".github" / "workflows" / name).read_text(encoding="utf-8")
        assert "workflow_dispatch:" in workflow
        assert "environment: staging" in workflow


def test_production_monitor_rejects_non_https_before_network(monkeypatch):
    monitor = load_script("production-monitor.py")
    monkeypatch.setenv("PRODUCTION_BASE_URL", "http://production.example.invalid")
    monkeypatch.setenv("PRODUCTION_MONITORING_TOKEN", "synthetic-monitoring-token")
    with pytest.raises(RuntimeError, match="HTTPS"):
        monitor.main()


def test_production_monitoring_workflow_is_scheduled_and_secret_gated():
    workflow = (ROOT / ".github" / "workflows" / "production-monitoring.yml").read_text(encoding="utf-8")
    assert "schedule:" in workflow
    assert "environment: production" in workflow
    assert "secrets.PRODUCTION_BASE_URL" in workflow
    assert "secrets.PRODUCTION_MONITORING_TOKEN" in workflow
