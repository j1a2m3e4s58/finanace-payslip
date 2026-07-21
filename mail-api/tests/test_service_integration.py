from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
from sqlalchemy import delete

import app as portal
from storage import DatabaseStore


ROOT = Path(__file__).resolve().parents[2]


def test_postgresql_transactional_store_round_trip(tmp_path, monkeypatch):
    database_url = os.getenv("TEST_POSTGRES_DATABASE_URL", "").strip()
    if not database_url:
        pytest.skip("TEST_POSTGRES_DATABASE_URL is required for the PostgreSQL integration gate")
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("REQUIRE_POSTGRESQL", "true")
    store = DatabaseStore(str(tmp_path))
    key = f"integration-{time.time_ns()}.json"
    try:
        assert store.backend == "postgresql"
        store.save(key, [{"status": "draft", "amount": 1000}])
        assert store.load(key) == (True, [{"status": "draft", "amount": 1000}])
        result = store.mutate(key, [], lambda rows: (rows + [{"status": "approved"}], "committed"))
        assert result == "committed"
        assert store.load(key)[1][-1]["status"] == "approved"
        assert store.health() == {"ok": True, "backend": "postgresql"}
    finally:
        with store.engine.begin() as connection:
            connection.execute(delete(store.documents).where(store.documents.c.store_key == key))
        store.engine.dispose()


def test_smtp_service_builds_one_private_message_with_attachment(monkeypatch):
    capture = ROOT / ".tmp" / "e2e-smtp" / "messages.jsonl"
    process = subprocess.Popen(
        [sys.executable, str(ROOT / "scripts" / "run-e2e-smtp.py")],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        _wait_for_port("127.0.0.1", 1025)
        monkeypatch.setenv("MAIL_SERVER", "127.0.0.1")
        monkeypatch.setenv("MAIL_PORT", "1025")
        monkeypatch.setenv("MAIL_SECURITY", "none")
        monkeypatch.setenv("MAIL_USERNAME", "integration-user")
        monkeypatch.setenv("MAIL_PASSWORD", "integration-password")
        monkeypatch.setenv("MAIL_DEFAULT_SENDER", "finance@bawjiasecommunitybank.com")
        message_id = portal.send_mail(
            "recipient@bawjiasecommunitybank.com",
            "Integration payslip test",
            "Private test message",
            "<p>Private test message</p>",
            ("test-payslip.pdf", b"%PDF-1.4 synthetic integration payload", "application/pdf"),
            "integration-delivery",
        )
        assert message_id.startswith("<") and message_id.endswith(">")
        messages = _wait_for_messages(capture, 1)
        message = messages[-1]
        assert len(message["recipients"]) == 1
        assert "recipient@bawjiasecommunitybank.com" in message["recipients"][0]
        assert "To: recipient@bawjiasecommunitybank.com" in message["data"]
        assert "Bcc:" not in message["data"]
        assert 'filename="test-payslip.pdf"' in message["data"]
        assert "X-BCB-Delivery-ID: integration-delivery" in message["data"]
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def _wait_for_port(host: str, port: int, timeout: float = 10) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.1)
    raise AssertionError(f"SMTP test server did not open {host}:{port}")


def _wait_for_messages(path: Path, count: int, timeout: float = 10) -> list[dict]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if path.exists():
            messages = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
            if len(messages) >= count:
                return messages
        time.sleep(0.1)
    raise AssertionError(f"Expected {count} captured SMTP message(s)")
