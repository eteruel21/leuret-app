#!/usr/bin/env python3
"""Encrypted snapshots of the Leuret database and private file bucket."""

import argparse
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
from time import monotonic
from urllib.parse import unquote, urlsplit
from uuid import uuid4
from zipfile import BadZipFile, ZIP_STORED, ZipFile
from zoneinfo import ZoneInfo

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
import psycopg2
from psycopg2 import sql


PROJECT_REF = "dixvnkfkjqfwdoolxnax"
SOURCE_BUCKET = "contractor-private-storage"
APP_SCHEMAS = ("app", "app_auth", "app_migrations", "private", "public")
CORE_TABLES = {"app_auth.users", "public.companies", "app_migrations.schema_migrations"}
OBJECT_HEADERS = (
    "ContentType", "CacheControl", "ContentDisposition", "ContentEncoding",
    "ContentLanguage", "Expires", "Metadata",
)
CHUNK_SIZE = 1024 * 1024


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Falta configurar {name}.")
    return value


def postgres_environment(settings):
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    env.update({"PG" + key.upper(): str(value) for key, value in settings.items()})
    env["PGCONNECT_TIMEOUT"] = "15"
    return env


def run(command, *, env=None):
    result = subprocess.run(command, env=env, capture_output=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"{command[0]} terminó con código {result.returncode}.")


def production_database(ca_file):
    target = urlsplit(required("LEURET_BACKUP_DATABASE_URL"))
    user = unquote(target.username or "")
    direct = target.hostname == f"db.{PROJECT_REF}.supabase.co"
    pooler = (
        bool(target.hostname)
        and target.hostname.endswith(".pooler.supabase.com")
        and user.endswith(f".{PROJECT_REF}")
    )
    if (
        target.scheme not in ("postgres", "postgresql") or not (direct or pooler)
        or target.port not in (None, 5432) or target.path != "/postgres"
        or target.query or target.fragment or not user or not target.password
    ):
        raise ValueError("Se requiere la conexión directa o Session Pooler del proyecto Leuret en el puerto 5432.")
    ca_file.write_text(required("LEURET_BACKUP_DATABASE_CA_PEM") + "\n", encoding="utf-8")
    return {
        "host": target.hostname, "port": 5432, "database": "postgres", "user": user,
        "password": unquote(target.password), "sslmode": "verify-full", "sslrootcert": str(ca_file),
    }


def database_inventory(cursor):
    cursor.execute("""
        SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity,
               (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY(%s) AND c.relkind IN ('r', 'p')
        ORDER BY n.nspname, c.relname
    """, (list(APP_SCHEMAS),))
    tables = {}
    for schema, table, rls, force_rls, policies in cursor.fetchall():
        cursor.execute(sql.SQL("SELECT count(*) FROM ONLY {}").format(sql.Identifier(schema, table)))
        tables[f"{schema}.{table}"] = {
            "rows": cursor.fetchone()[0], "rls": rls, "force_rls": force_rls, "policies": policies,
        }
    if not CORE_TABLES.issubset(tables):
        raise ValueError("Faltan tablas principales de Leuret.")
    cursor.execute("SELECT filename, checksum FROM app_migrations.schema_migrations ORDER BY filename")
    migrations = [list(row) for row in cursor.fetchall()]
    if not migrations:
        raise ValueError("Falta el historial de migraciones de Leuret.")
    cursor.execute("""
        SELECT DISTINCT r.rolname
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_roles r ON r.oid = ANY(p.polroles)
        WHERE n.nspname = ANY(%s)
        ORDER BY r.rolname
    """, (list(APP_SCHEMAS),))
    return {"tables": tables, "migrations": migrations, "policy_roles": [row[0] for row in cursor]}


def dump_database(settings, output):
    with closing(psycopg2.connect(**settings, connect_timeout=15)) as db:
        if db.server_version // 10000 != 17:
            raise ValueError("El procedimiento de respaldo requiere PostgreSQL 17.")
        db.set_session(isolation_level="REPEATABLE READ", readonly=True)
        with db, db.cursor() as cursor:
            cursor.execute("SET LOCAL row_security = off")
            cursor.execute("SET LOCAL statement_timeout = '120s'")
            for managed_table in (("auth", "users"), ("storage", "objects")):
                cursor.execute("SELECT to_regclass(%s)", (".".join(managed_table),))
                if cursor.fetchone()[0] is not None:
                    cursor.execute(sql.SQL("SELECT EXISTS (SELECT FROM {})").format(sql.Identifier(*managed_table)))
                    if cursor.fetchone()[0]:
                        raise ValueError("Supabase Auth o Storage contiene datos fuera del alcance de esta copia.")
            cursor.execute("SELECT pg_export_snapshot(), transaction_timestamp()")
            snapshot, captured_at = cursor.fetchone()
            inventory = database_inventory(cursor)
            run([
                "pg_dump", "--format=custom", "--large-objects", "--strict-names", "--lock-wait-timeout=15s",
                f"--snapshot={snapshot}", "--file", str(output),
                *(f"--schema={schema}" for schema in APP_SCHEMAS),
            ], env=postgres_environment(settings))
    run(["pg_restore", "--list", str(output)])
    return captured_at.astimezone(timezone.utc), inventory


def r2_client(scope):
    endpoint = required(f"LEURET_{scope}_R2_ENDPOINT")
    if not re.fullmatch(r"https://[0-9a-f]{32}(?:\.eu|\.fedramp)?\.r2\.cloudflarestorage\.com", endpoint):
        raise ValueError(f"El endpoint R2 de {scope} debe ser el endpoint S3 HTTPS de Cloudflare.")
    return boto3.client(
        "s3", endpoint_url=endpoint, region_name="auto",
        aws_access_key_id=required(f"LEURET_{scope}_R2_KEY_ID"),
        aws_secret_access_key=required(f"LEURET_{scope}_R2_SECRET"),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}, retries={"mode": "standard"}),
    )


def list_objects(client, bucket):
    objects = {}
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket):
        for item in page.get("Contents", []):
            objects[item["Key"]] = (item["Size"], item["ETag"], item["LastModified"])
    return objects


def fingerprint(source, destination=None):
    digest = sha256()
    size = 0
    for chunk in iter(lambda: source.read(CHUNK_SIZE), b""):
        digest.update(chunk)
        size += len(chunk)
        if destination is not None:
            destination.write(chunk)
    return {"sha256": digest.hexdigest(), "bytes": size}


def file_fingerprint(path):
    with path.open("rb") as stream:
        return fingerprint(stream)


def create_package(settings, source, package):
    before = list_objects(source, SOURCE_BUCKET)
    dump = package.with_name("database.dump")
    captured_at, inventory = dump_database(settings, dump)
    manifest = {
        "format": 1, "captured_at": captured_at.isoformat(), "source_bucket": SOURCE_BUCKET,
        "database": {**file_fingerprint(dump), "inventory": inventory}, "objects": [],
    }
    with ZipFile(package, "x", compression=ZIP_STORED) as archive:
        archive.write(dump, "database.dump")
        dump.unlink()
        for index, (key, (size, etag, modified)) in enumerate(sorted(before.items())):
            obj = source.get_object(Bucket=SOURCE_BUCKET, Key=key, IfMatch=etag)
            member = f"objects/{index:08d}"
            with closing(obj["Body"]) as body, archive.open(member, "w", force_zip64=True) as data:
                details = fingerprint(body, data)
            if details["bytes"] != size or obj["LastModified"].replace(microsecond=0) != modified.replace(microsecond=0):
                raise RuntimeError("Un objeto de R2 cambió durante la copia. Reintenta el respaldo.")
            headers = {field: obj[field] for field in OBJECT_HEADERS if field in obj}
            if isinstance(headers.get("Expires"), datetime):
                headers["Expires"] = headers["Expires"].isoformat()
            manifest["objects"].append({"key": key, "headers": headers, **details})
        if list_objects(source, SOURCE_BUCKET) != before:
            raise RuntimeError("El inventario de R2 cambió durante la copia. Reintenta el respaldo.")
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
    return manifest


def snapshot_key(captured_at):
    panama = captured_at.astimezone(ZoneInfo("America/Panama"))
    tier = "daily"
    if panama.day == 1:
        tier = "monthly"
    elif panama.weekday() == 6:
        tier = "weekly"
    return f"leuret/{tier}/{captured_at:%Y%m%dT%H%M%SZ}-{uuid4().hex[:12]}.zip.age"


def publish(archive, bucket, key, encrypted):
    expected = file_fingerprint(encrypted)
    archive.upload_file(str(encrypted), bucket, key)
    with closing(archive.get_object(Bucket=bucket, Key=key)["Body"]) as remote:
        if fingerprint(remote) != expected:
            raise ValueError("El archivo descargado de R2 difiere del respaldo cifrado local.")
    archive.put_object(Bucket=bucket, Key=key + ".sha256", Body=(expected["sha256"] + "\n").encode())


def backup():
    archive_bucket = required("LEURET_BACKUP_R2_BUCKET")
    if archive_bucket == SOURCE_BUCKET or archive_bucket.startswith("leuret-restore-"):
        raise ValueError("Configura un bucket privado exclusivo para los respaldos.")
    source = r2_client("SOURCE")
    archive = r2_client("BACKUP")
    recipient = required("LEURET_BACKUP_AGE_RECIPIENT")
    with TemporaryDirectory(prefix="leuret-backup-") as work:
        work = Path(work)
        settings = production_database(work / "ca.pem")
        package, encrypted = work / "snapshot.zip", work / "snapshot.zip.age"
        manifest = create_package(settings, source, package)
        run(["age", "--encrypt", "--recipient", recipient, "--output", str(encrypted), str(package)])
        package.unlink()
        key = snapshot_key(datetime.fromisoformat(manifest["captured_at"]))
        publish(archive, archive_bucket, key, encrypted)
        print(f"Respaldo cifrado y verificado {key} ({len(manifest['objects'])} objetos).")


def unpack(package, output):
    with ZipFile(package) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        if manifest["format"] != 1 or manifest["source_bucket"] != SOURCE_BUCKET:
            raise ValueError("Formato de respaldo u origen de R2 desconocido.")
        entries = {"database.dump": manifest["database"]}
        entries.update({f"objects/{i:08d}": obj for i, obj in enumerate(manifest["objects"])})
        members = archive.namelist()
        if len(members) != len(entries) + 1 or set(members) != entries.keys() | {"manifest.json"}:
            raise ValueError("Los archivos del respaldo difieren del inventario.")
        (output / "objects").mkdir()
        for member, expected in entries.items():
            with archive.open(member) as data, (output / member).open("xb") as target:
                actual = fingerprint(data, target)
            if actual != {key: expected[key] for key in ("bytes", "sha256")}:
                raise ValueError("Un archivo extraído no coincide con el SHA-256 y tamaño del inventario.")
        (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        return manifest


@contextmanager
def isolated_database(data_dir=None):
    # A private Unix socket has neither a TCP listener nor a connection URL that can be redirected.
    with (
        TemporaryDirectory(prefix="leuret-pg-", dir=data_dir) as work,
        TemporaryDirectory(prefix="leuret-socket-", dir="/tmp") as socket,
    ):
        cluster = Path(work) / "data"
        settings = {"host": socket, "port": 5432, "database": "postgres", "user": "postgres"}
        env = postgres_environment(settings)
        run(["initdb", "-D", str(cluster), "--username=postgres", "--auth=trust", "--no-locale", "--encoding=UTF8"], env=env)
        options = f"-c listen_addresses='' -c ssl=off -p 5432 -k {socket}"
        try:
            run(["pg_ctl", "-D", str(cluster), "-l", work + "/postgres.log", "-o", options, "-w", "start"], env=env)
            yield settings
        finally:
            if (cluster / "postmaster.pid").exists():
                run(["pg_ctl", "-D", str(cluster), "-m", "fast", "-w", "stop"], env=env)


def restore_database(dump, expected):
    with isolated_database(dump.parent) as settings:
        with closing(psycopg2.connect(**settings)) as db:
            with db, db.cursor() as cursor:
                cursor.execute("DROP SCHEMA public")
                cursor.execute("CREATE SCHEMA extensions")
                cursor.execute("CREATE EXTENSION pgcrypto WITH SCHEMA extensions")
                cursor.execute('CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions')
                for role in expected["policy_roles"]:
                    cursor.execute("SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = %s)", (role,))
                    if not cursor.fetchone()[0]:
                        cursor.execute(sql.SQL("CREATE ROLE {} NOLOGIN").format(sql.Identifier(role)))
            run([
                "pg_restore", "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges",
                "--dbname", settings["database"], str(dump),
            ], env=postgres_environment(settings))
            with db, db.cursor() as cursor:
                if database_inventory(cursor) != expected:
                    raise ValueError("Tablas, filas, migraciones o políticas RLS difieren de la copia original.")


def restore(encrypted, identity, output):
    started = monotonic()
    digest_file = encrypted.with_name(encrypted.name + ".sha256")
    if file_fingerprint(encrypted)["sha256"] != digest_file.read_text(encoding="ascii").strip():
        raise ValueError("SHA-256 inválido para el respaldo cifrado.")
    output.mkdir(mode=0o700)
    try:
        with TemporaryDirectory(prefix="decrypt-", dir=output) as work:
            package = Path(work) / "snapshot.zip"
            run(["age", "--decrypt", "--identity", str(identity), "--output", str(package), str(encrypted)])
            manifest = unpack(package, output)
        restore_database(output / "database.dump", manifest["database"]["inventory"])
    except BaseException:
        shutil.rmtree(output)
        raise
    tables = len(manifest["database"]["inventory"]["tables"])
    print(f"Recuperación aislada verificada ({tables} tablas, {len(manifest['objects'])} objetos, {monotonic() - started:.1f} s).")


def copy_files(output, target, bucket):
    if not re.fullmatch(r"leuret-restore-[a-z0-9][a-z0-9-]*", bucket) or bucket == os.environ.get("LEURET_BACKUP_R2_BUCKET"):
        raise ValueError("Usa un bucket privado exclusivo cuyo nombre comience con leuret-restore-.")
    if target.list_objects_v2(Bucket=bucket, MaxKeys=1).get("Contents"):
        raise ValueError("El bucket de recuperación debe estar vacío.")
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    for index, entry in enumerate(manifest["objects"]):
        path = output / "objects" / f"{index:08d}"
        expected = {field: entry[field] for field in ("bytes", "sha256")}
        if file_fingerprint(path) != expected:
            raise ValueError("Un archivo local difiere del inventario de recuperación.")
        headers = entry["headers"].copy()
        if "Expires" in headers:
            headers["Expires"] = datetime.fromisoformat(headers["Expires"])
        target.upload_file(str(path), bucket, entry["key"], ExtraArgs=headers)
        restored = target.get_object(Bucket=bucket, Key=entry["key"])
        with closing(restored["Body"]) as remote:
            if fingerprint(remote) != expected or any(restored.get(key) != value for key, value in headers.items()):
                raise ValueError("El objeto restaurado difiere de la copia.")
    print(f"Recuperación de R2 verificada ({len(manifest['objects'])} objetos).")


def main():
    os.umask(0o077)
    for name in list(os.environ):
        if name.startswith("PG"):
            del os.environ[name]
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="operation", required=True)
    commands.add_parser("backup")
    recovery = commands.add_parser("restore")
    recovery.add_argument("encrypted", type=Path)
    recovery.add_argument("--identity", type=Path, required=True)
    recovery.add_argument("--output", type=Path, required=True)
    files = commands.add_parser("restore-files")
    files.add_argument("output", type=Path)
    files.add_argument("--bucket", required=True)
    args = parser.parse_args()
    try:
        if args.operation == "backup":
            backup()
        elif args.operation == "restore":
            restore(args.encrypted, args.identity, args.output)
        else:
            copy_files(args.output, r2_client("RESTORE"), args.bucket)
    except ClientError as error:
        sys.exit(f"R2 rechazó {error.operation_name}: {error.response['Error']['Code']}.")
    except (BadZipFile, BotoCoreError, psycopg2.Error, OSError, KeyError, TypeError) as error:
        sys.exit(f"Falló {args.operation}: {type(error).__name__}. Revisa conectividad, permisos y configuración.")
    except (RuntimeError, ValueError) as error:
        sys.exit(str(error))


if __name__ == "__main__":
    main()
