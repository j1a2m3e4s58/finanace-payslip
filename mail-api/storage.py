from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

from sqlalchemy import BigInteger, Column, Integer, MetaData, String, Table, Text, create_engine, select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert


class DatabaseStore:
    """Transactional document storage used while core payroll tables are normalized.

    Production uses PostgreSQL through DATABASE_URL. Local development defaults to
    SQLite so the application remains self-contained. Each former JSON store is a
    versioned database document and existing JSON data is imported on first read.
    """

    def __init__(self, data_dir: str):
        default_path = Path(data_dir) / "bcb_portal.db"
        url = str(os.getenv("DATABASE_URL") or f"sqlite:///{default_path.as_posix()}").strip()
        if url.startswith("postgres://"):
            url = "postgresql+psycopg://" + url.removeprefix("postgres://")
        elif url.startswith("postgresql://") and "+" not in url.split("://", 1)[0]:
            url = "postgresql+psycopg://" + url.removeprefix("postgresql://")
        self.url = url
        self.engine = create_engine(url, pool_pre_ping=True, future=True)
        self.metadata = MetaData()
        self.documents = Table(
            "portal_store",
            self.metadata,
            Column("store_key", String(190), primary_key=True),
            Column("payload", Text, nullable=False),
            Column("version", Integer, nullable=False, default=1),
            Column("updated_at", BigInteger, nullable=False),
        )
        self.schema_migrations = Table(
            "schema_migrations",
            self.metadata,
            Column("version", Integer, primary_key=True),
            Column("name", String(190), nullable=False),
            Column("applied_at", BigInteger, nullable=False),
        )
        self._lock = threading.RLock()
        if str(os.getenv("REQUIRE_POSTGRESQL", "false")).lower() in {"1", "true", "yes"} and self.engine.dialect.name != "postgresql":
            raise RuntimeError("Production requires PostgreSQL; configure DATABASE_URL before startup")
        self.metadata.create_all(self.engine)
        self._apply_schema_migrations()

    def _apply_schema_migrations(self) -> None:
        """Record ordered schema upgrades so production changes are auditable."""
        migrations = [(1, "create_transactional_portal_store")]
        with self._lock, self.engine.begin() as connection:
            applied = {int(row.version) for row in connection.execute(select(self.schema_migrations.c.version))}
            for version, name in migrations:
                if version in applied:
                    continue
                connection.execute(self.schema_migrations.insert().values(version=version, name=name, applied_at=int(time.time() * 1000)))

    @property
    def backend(self) -> str:
        return self.engine.dialect.name

    def load(self, key: str):
        with self.engine.connect() as connection:
            row = connection.execute(select(self.documents.c.payload).where(self.documents.c.store_key == key)).first()
        if not row:
            return False, None
        return True, json.loads(row.payload)

    def save(self, key: str, payload) -> None:
        encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
        values = {"store_key": key, "payload": encoded, "version": 1, "updated_at": int(time.time() * 1000)}
        with self._lock, self.engine.begin() as connection:
            if self.backend == "postgresql":
                statement = postgres_insert(self.documents).values(**values)
                statement = statement.on_conflict_do_update(
                    index_elements=[self.documents.c.store_key],
                    set_={"payload": encoded, "version": self.documents.c.version + 1, "updated_at": values["updated_at"]},
                )
            elif self.backend == "sqlite":
                statement = sqlite_insert(self.documents).values(**values)
                statement = statement.on_conflict_do_update(
                    index_elements=[self.documents.c.store_key],
                    set_={"payload": encoded, "version": self.documents.c.version + 1, "updated_at": values["updated_at"]},
                )
            else:
                existing = connection.execute(select(self.documents.c.store_key).where(self.documents.c.store_key == key)).first()
                if existing:
                    connection.execute(self.documents.update().where(self.documents.c.store_key == key).values(payload=encoded, version=self.documents.c.version + 1, updated_at=values["updated_at"]))
                    return
                statement = self.documents.insert().values(**values)
            connection.execute(statement)

    def migrate_json_file(self, key: str, path: str, default):
        found, payload = self.load(key)
        if found:
            return payload
        source = Path(path)
        try:
            payload = json.loads(source.read_text(encoding="utf-8-sig")) if source.exists() else default
        except (OSError, json.JSONDecodeError):
            payload = default
        self.save(key, payload)
        return payload

    def mutate(self, key: str, default, callback):
        """Atomically read, transform, and persist one document.

        PostgreSQL uses a row lock so queue claims and other critical transitions
        remain safe when several application instances are running.
        """
        with self._lock, self.engine.begin() as connection:
            statement = select(self.documents.c.payload, self.documents.c.version).where(self.documents.c.store_key == key)
            if self.backend == "postgresql":
                statement = statement.with_for_update()
            row = connection.execute(statement).first()
            current = json.loads(row.payload) if row else default
            updated, result = callback(current)
            encoded = json.dumps(updated, ensure_ascii=True, separators=(",", ":"))
            values = {"store_key": key, "payload": encoded, "version": int(row.version if row else 0) + 1, "updated_at": int(time.time() * 1000)}
            if row:
                connection.execute(self.documents.update().where(self.documents.c.store_key == key).values(payload=encoded, version=values["version"], updated_at=values["updated_at"]))
            else:
                connection.execute(self.documents.insert().values(**values))
            return result

    def health(self) -> dict:
        with self.engine.connect() as connection:
            connection.execute(select(self.documents.c.store_key).limit(1)).first()
        return {"ok": True, "backend": self.backend}
