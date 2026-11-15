from contextlib import closing
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest

import psycopg2

from production_backup import (
    SOURCE_BUCKET, copy_files, create_package, isolated_database, publish, restore, run, snapshot_key,
)


class MemoryS3:
    def __init__(self):
        self.objects = {}

    def get_paginator(self, operation):
        assert operation == "list_objects_v2"
        return self

    def paginate(self, Bucket):
        # Each object is returned on its own page to exercise pagination.
        for (bucket, key), obj in self.objects.items():
            if bucket == Bucket:
                yield {"Contents": [{"Key": key, "Size": len(obj["Body"]), **{
                    field: obj[field] for field in ("ETag", "LastModified")
                }}]}

    def list_objects_v2(self, Bucket, MaxKeys):
        return next(self.paginate(Bucket), {})

    def put_object(self, Bucket, Key, Body, **headers):
        self.objects[Bucket, Key] = {
            "Body": Body, "ETag": f'"{len(Body)}"',
            "LastModified": datetime(2026, 11, 15, tzinfo=timezone.utc), **headers,
        }

    def get_object(self, Bucket, Key, IfMatch=None):
        obj = self.objects[Bucket, Key]
        assert IfMatch is None or obj["ETag"] == IfMatch
        return {**obj, "Body": BytesIO(obj["Body"])}

    def upload_file(self, path, bucket, key, ExtraArgs=None):
        self.put_object(bucket, key, Path(path).read_bytes(), **(ExtraArgs or {}))


class ProductionBackupTest(unittest.TestCase):
    def test_encryption_remote_verification_and_isolated_restore(self):
        source = MemoryS3()
        fixture_key = "projects/Plano revisión.pdf"
        source.put_object(SOURCE_BUCKET, fixture_key, b"synthetic project file", ContentType="application/pdf")
        source.put_object(SOURCE_BUCKET, "photos/empty", b"", Metadata={"example": "synthetic"})

        with TemporaryDirectory() as scratch:
            work = Path(scratch)
            with isolated_database(work) as settings:
                with closing(psycopg2.connect(**settings)) as db, db, db.cursor() as cursor:
                    cursor.execute("SELECT inet_server_addr() IS NULL OR inet_server_addr() = '127.0.0.1'")
                    self.assertTrue(cursor.fetchone()[0])
                    cursor.execute("""
                        CREATE SCHEMA app;
                        CREATE SCHEMA app_auth;
                        CREATE SCHEMA app_migrations;
                        CREATE SCHEMA private;
                        CREATE ROLE contractor_api NOLOGIN;
                        CREATE TABLE app_auth.users (id int PRIMARY KEY);
                        CREATE TABLE public.companies (id int PRIMARY KEY, owner_id int REFERENCES app_auth.users(id));
                        CREATE TABLE app_migrations.schema_migrations (filename text PRIMARY KEY, checksum text NOT NULL);
                        ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
                        CREATE POLICY companies_read ON public.companies TO contractor_api USING (owner_id = 1);
                        INSERT INTO app_auth.users VALUES (1), (2);
                        INSERT INTO public.companies VALUES (1, 1), (2, 2);
                        INSERT INTO app_migrations.schema_migrations VALUES ('001_test.sql', 'example-checksum');
                    """)
                package = work / "snapshot.zip"
                manifest = create_package(settings, source, package)
                self.assertEqual(manifest["database"]["inventory"]["tables"]["public.companies"]["rows"], 2)
                self.assertEqual(len(manifest["objects"]), 2)

            identity, encrypted = work / "identity.txt", work / "snapshot.zip.age"
            run(["age-keygen", "--output", str(identity)])
            recipient = subprocess.check_output(["age-keygen", "-y", str(identity)], text=True).strip()
            run(["age", "--encrypt", "--recipient", recipient, "--output", str(encrypted), str(package)])
            self.assertNotIn(b"synthetic project file", encrypted.read_bytes())

            archive = MemoryS3()
            key = snapshot_key(datetime.fromisoformat(manifest["captured_at"]))
            publish(archive, "backup", key, encrypted)
            downloaded = work / "download.zip.age"
            downloaded.write_bytes(archive.get_object("backup", key)["Body"].read())
            digest = work / "download.zip.age.sha256"
            digest.write_bytes(archive.get_object("backup", key + ".sha256")["Body"].read())

            output = work / "recovered"
            restore(downloaded, identity, output)
            restored = MemoryS3()
            copy_files(output, restored, "leuret-restore-ci")
            obj = restored.get_object("leuret-restore-ci", fixture_key)
            self.assertEqual(obj["Body"].read(), b"synthetic project file")
            self.assertEqual(obj["ContentType"], "application/pdf")

            downloaded.write_bytes(downloaded.read_bytes() + b"corruption")
            with self.assertRaisesRegex(ValueError, "SHA-256 inválido"):
                restore(downloaded, identity, work / "corrupt")
            self.assertFalse((work / "corrupt").exists())

    def test_incomplete_remote_copy_has_no_integrity_marker(self):
        class CorruptArchive(MemoryS3):
            def get_object(self, Bucket, Key, IfMatch=None):
                return {"Body": BytesIO(b"incomplete")}

        archive = CorruptArchive()
        with TemporaryDirectory() as work:
            encrypted = Path(work) / "snapshot.zip.age"
            encrypted.write_bytes(b"example of a complete snapshot")
            with self.assertRaisesRegex(ValueError, "difiere"):
                publish(archive, "backup", "snapshot", encrypted)
        self.assertNotIn(("backup", "snapshot.sha256"), archive.objects)

    def test_retention_uses_panama_date(self):
        self.assertIn("/monthly/", snapshot_key(datetime(2026, 11, 2, 2, tzinfo=timezone.utc)))
        self.assertIn("/weekly/", snapshot_key(datetime(2026, 11, 9, 2, tzinfo=timezone.utc)))
        self.assertIn("/daily/", snapshot_key(datetime(2026, 11, 9, 7, tzinfo=timezone.utc)))


if __name__ == "__main__":
    unittest.main()
