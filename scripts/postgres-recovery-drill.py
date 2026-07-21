"""Encrypted PostgreSQL migration and recovery drill for test/staging only.

The drill creates a disposable PostgreSQL database, copies and encrypts the
document store, restores it, verifies content hashes and schema migrations,
then drops the disposable database. It never prints document contents.
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "mail-api"))
from storage import DatabaseStore  # noqa: E402


def normalized_psycopg_url(url: str) -> str:
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def database_url_with_name(url: str, name: str) -> str:
    parts = urlsplit(normalized_psycopg_url(url))
    return urlunsplit((parts.scheme, parts.netloc, f"/{name}", parts.query, parts.fragment))


def snapshot(store: DatabaseStore) -> dict[str, str]:
    with store.engine.connect() as connection:
        return {str(row.store_key): str(row.payload) for row in connection.execute(select(store.documents.c.store_key, store.documents.c.payload))}


def digest(documents: dict[str, str]) -> str:
    encoded = json.dumps(documents, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def main() -> None:
    source_url = os.getenv("TEST_POSTGRES_DATABASE_URL", "").strip()
    if not source_url:
        raise SystemExit("TEST_POSTGRES_DATABASE_URL is required")
    source_name = urlsplit(normalized_psycopg_url(source_url)).path.strip("/").lower()
    if not any(marker in source_name for marker in ("test", "staging", "drill")):
        raise SystemExit("Recovery drills are restricted to databases named test, staging, or drill")
    restore_name = f"bcb_restore_drill_{int(time.time())}_{secrets.token_hex(3)}"
    admin_url = database_url_with_name(source_url, "postgres")
    restore_url = database_url_with_name(source_url, restore_name)
    previous_url = os.environ.get("DATABASE_URL")
    previous_required = os.environ.get("REQUIRE_POSTGRESQL")
    os.environ["DATABASE_URL"] = source_url
    os.environ["REQUIRE_POSTGRESQL"] = "true"
    source = DatabaseStore(str(ROOT / ".tmp"))
    sentinel_key = f"recovery-drill-{secrets.token_hex(8)}"
    source.save(sentinel_key, {"synthetic": True, "createdAt": int(time.time())})
    restored = None
    try:
        original = snapshot(source)
        key = Fernet.generate_key()
        encrypted = Fernet(key).encrypt(json.dumps(original, sort_keys=True).encode("utf-8"))
        try:
            Fernet(Fernet.generate_key()).decrypt(encrypted)
            raise RuntimeError("Encrypted backup unexpectedly opened with the wrong key")
        except InvalidToken:
            pass
        with psycopg.connect(admin_url, autocommit=True) as connection:
            connection.execute(f'CREATE DATABASE "{restore_name}"')
        os.environ["DATABASE_URL"] = restore_url
        os.environ["REQUIRE_POSTGRESQL"] = "true"
        restored = DatabaseStore(str(ROOT / ".tmp"))
        for item_key, payload in json.loads(Fernet(key).decrypt(encrypted).decode("utf-8")).items():
            restored.save(item_key, json.loads(payload))
        recovered = snapshot(restored)
        if digest(original) != digest(recovered):
            raise RuntimeError("Restored PostgreSQL data hash does not match the source")
        if not restored.health()["ok"]:
            raise RuntimeError("Restored PostgreSQL database is unhealthy")
        print(f"PostgreSQL recovery drill passed: {len(original)} documents, SHA-256 {digest(original)[:12]}…, schema verified")
    finally:
        try:
            with source.engine.begin() as connection:
                connection.execute(source.documents.delete().where(source.documents.c.store_key == sentinel_key))
        finally:
            source.engine.dispose()
        if restored is not None:
            restored.engine.dispose()
        if previous_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_url
        if previous_required is None:
            os.environ.pop("REQUIRE_POSTGRESQL", None)
        else:
            os.environ["REQUIRE_POSTGRESQL"] = previous_required
        with psycopg.connect(admin_url, autocommit=True) as connection:
            connection.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s", (restore_name,))
            connection.execute(f'DROP DATABASE IF EXISTS "{restore_name}"')


if __name__ == "__main__":
    main()
