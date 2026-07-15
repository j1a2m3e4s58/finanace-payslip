import json

import pytest

from storage import DatabaseStore


def test_database_store_round_trip(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'portal.db').as_posix()}")
    store = DatabaseStore(str(tmp_path))
    store.save("staff.json", [{"staffId": "BCB-001"}])
    found, payload = store.load("staff.json")
    assert found is True
    assert payload == [{"staffId": "BCB-001"}]
    assert store.health()["ok"] is True


def test_json_migration_only_runs_once(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'portal.db').as_posix()}")
    source = tmp_path / "users.json"
    source.write_text(json.dumps([{"id": "one"}]), encoding="utf-8")
    store = DatabaseStore(str(tmp_path))
    assert store.migrate_json_file("users.json", str(source), []) == [{"id": "one"}]
    source.write_text(json.dumps([{"id": "two"}]), encoding="utf-8")
    assert store.migrate_json_file("users.json", str(source), []) == [{"id": "one"}]


def test_atomic_mutation_returns_result(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'portal.db').as_posix()}")
    store = DatabaseStore(str(tmp_path))
    result = store.mutate("queue.json", [], lambda rows: (rows + [{"id": "one"}], "claimed"))
    assert result == "claimed"
    assert store.load("queue.json")[1] == [{"id": "one"}]


def test_schema_migration_is_recorded(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'portal.db').as_posix()}")
    monkeypatch.delenv("REQUIRE_POSTGRESQL", raising=False)
    store = DatabaseStore(str(tmp_path))
    with store.engine.connect() as connection:
        rows = connection.execute(store.schema_migrations.select()).fetchall()
    assert [(row.version, row.name) for row in rows] == [(1, "create_transactional_portal_store")]


def test_production_database_guard_rejects_sqlite(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'portal.db').as_posix()}")
    monkeypatch.setenv("REQUIRE_POSTGRESQL", "true")
    with pytest.raises(RuntimeError, match="requires PostgreSQL"):
        DatabaseStore(str(tmp_path))
