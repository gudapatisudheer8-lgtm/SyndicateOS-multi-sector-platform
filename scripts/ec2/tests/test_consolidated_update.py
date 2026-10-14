"""Local deployment safety tests. No root operations, secrets, EC2 or RDS calls."""
import importlib.util
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "consolidated-update.py"
spec = importlib.util.spec_from_file_location("ec2_update", SCRIPT)
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)


class UpdateSafetyTests(unittest.TestCase):
    def command(self, jar):
        return ("ExecStart=/usr/bin/java -Xmx256m -jar " + jar
                + " --server.address=127.0.0.1 --server.port=8080"
                + " --sos.setup-approved=false --sos.preview-fixture=false --spring.flyway.enabled=false")

    def fixture(self, root):
        files = {"update.py": "safe script", "sos-api.jar": "jar bytes", "web/index.html": "<html></html>",
                 "web/release.json": "{}", "permissions.sql": "guarded sql"}
        for name, content in files.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        meta = {"update": "sos-consolidated-20261012", "base_release": update.BASE,
                "schema_version": 23, "api_sha256": update.digest(root / "sos-api.jar"),
                "index_sha256": update.digest(root / "web/index.html")}
        (root / "update.json").write_text(json.dumps(meta))
        (root / "FILES.sha256").write_text("".join(
            f"{update.digest(path)}  {path.relative_to(root)}\n"
            for path in sorted(root.rglob("*")) if path.is_file()))
        return meta

    def test_manifest_accepts_complete_package(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            meta = self.fixture(root)
            self.assertEqual(update.verify_files(root), meta)

    def test_changed_file_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            (root / "sos-api.jar").write_text("different bytes")
            with self.assertRaisesRegex(RuntimeError, "modified"):
                update.verify_files(root)

    def test_manifest_cannot_escape_package(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            with (root / "FILES.sha256").open("a") as stream:
                stream.write("a" * 64 + "  ../outside\n")
            with self.assertRaises(RuntimeError):
                update.verify_files(root)

    def test_symlink_payload_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            (root / "sos-api.jar").unlink()
            (root / "sos-api.jar").symlink_to(root / "permissions.sql")
            with self.assertRaises(RuntimeError):
                update.verify_files(root)

    def test_preserves_effective_jvm_and_sandbox_flags(self):
        text = self.command("/opt/syndicateos/current/sos-api.jar")
        text += "\nExecStart=\n" + self.command("/opt/syndicateos/api-fixes/older-fix/sos-api.jar").replace("-Xmx256m", "-Xmx384m")
        result = update.api_command(text, Path("/opt/syndicateos/releases/sos-consolidated-20261012/sos-api.jar"))
        self.assertIn("-Xmx384m", result)
        self.assertIn("--sos.setup-approved=false", result)
        self.assertNotIn("older-fix", result)
        self.assertNotIn("ExecStart=", result)

    def test_ambiguous_or_unsafe_service_rejected(self):
        good = self.command("/opt/syndicateos/current/sos-api.jar")
        for text in (good + "\n" + good, good.replace("127.0.0.1", "0.0.0.0"),
                     good.replace("--spring.flyway.enabled=false", "--spring.flyway.enabled=true"),
                     good.replace("--sos.setup-approved=false", "--sos.setup-approved=true"),
                     good.replace("--sos.preview-fixture=false", "--sos.preview-fixture=true")):
            with self.assertRaises(RuntimeError):
                update.api_command(text, Path("/opt/syndicateos/releases/new/sos-api.jar"))

    def test_known_roots_only(self):
        for root in ("/opt/syndicateos/current/web", "/opt/syndicateos/frontend-fixes/older-fix/web",
                     "/opt/syndicateos/releases/sos-consolidated-20261012/web"):
            self.assertEqual(update.routing_root(f"root {root};\n"), root)
        for text in ("root /var/www/other-app;\n", "root /opt/syndicateos/current/web;\nroot /opt/syndicateos/current/web;\n"):
            with self.assertRaises(RuntimeError):
                update.routing_root(text)

    def db(self, **kwargs):
        return {"database": "sos", "role": "sos_deploy", "owners": 1, "version": 19,
                "failed": 0, "server": 170000, "size": 100, **kwargs}

    def test_database_identity_history_and_dump_version(self):
        with patch.object(update, "query", return_value=json.dumps(self.db())), patch.object(update, "output", return_value="pg_dump (PostgreSQL) 17.4"):
            self.assertEqual(update.database_check({})["version"], 19)
        for wrong in (self.db(database="other"), self.db(role="sos_runtime"),
                      self.db(owners=0), self.db(failed=1), self.db(version=24)):
            with patch.object(update, "query", return_value=json.dumps(wrong)):
                with self.assertRaises(RuntimeError):
                    update.database_check({})
        with patch.object(update, "query", return_value=json.dumps(self.db())), patch.object(update, "output", return_value="pg_dump (PostgreSQL) 16.4"):
            with self.assertRaisesRegex(RuntimeError, "No services stopped"):
                update.database_check({})

    def test_existing_schema_sql_never_posts_pending_or_bootstraps_owner(self):
        sql = (SCRIPT.parent / "sql/03_update_runtime_permissions.sql").read_text()
        self.assertIn("current_database() <> 'sos'", sql)
        self.assertIn("current_user <> 'sos_deploy'", sql)
        self.assertIn("version='23'", sql)
        self.assertNotIn("UPDATE sos.erp_records", sql)
        source = SCRIPT.read_text()
        self.assertIn('"--sos.upgrade-only=true"', source)
        self.assertNotIn("SOS_OWNER_INITIAL_PASSWORD", source)
        self.assertIn('if not migration_started:', source)
        self.assertIn("SOS LEFT STOPPED", source)

    def exercise_install(self, failure):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            package = root / "package"
            package.mkdir()
            meta = self.fixture(package)
            home = root / "home"
            home.mkdir()
            uploads = root / "uploads"
            uploads.mkdir()
            environment = root / "runtime.env"
            environment.write_text("fixture-only configuration")
            snippet = root / "nginx.conf"
            previous = "root /opt/syndicateos/current/web;\n"
            snippet.write_text(previous)
            backups = root / "backups"
            override = root / "systemd/update.conf"
            commands = []

            def execute(args, **kwargs):
                commands.append(args)
                if args[0] == "pg_dump":
                    if failure == "backup":
                        raise RuntimeError("simulated backup failure")
                    Path(args[args.index("--file") + 1]).write_bytes(b"fixture dump" * 100)

            initial_umask = os.umask(0o022)
            try:
                with patch.multiple(update, ROOT=package, HOME=home, CURRENT=home / "current",
                                    UPLOADS=uploads, ENV_FILE=environment, SNIPPET=snippet,
                                    BACKUPS=backups, OVERRIDE=override), \
                     patch.object(update, "run", side_effect=execute), \
                     patch.object(update, "output", return_value=self.command("/opt/syndicateos/current/sos-api.jar")), \
                     patch.object(update, "database_check", side_effect=[self.db(), self.db(version=23)]), \
                     patch.object(update, "https", return_value=b'{"status":"ready"}'), \
                     patch.object(update, "verify", side_effect=RuntimeError("simulated activation failure") if failure == "activation" else None), \
                     patch.object(update.shutil, "disk_usage", return_value=type("Disk", (), {"free": 10**12})()), \
                     patch.object(update.getpass, "getpass", return_value="public-test-fixture"), \
                     patch("builtins.input", return_value="NO" if failure == "cancel" else "update sos"), \
                     contextlib.redirect_stdout(io.StringIO()):
                    target = {"database_host": "example.test", "database_port": "5432", "domain": "example.test"}
                    if failure in ("backup", "activation"):
                        with self.assertRaisesRegex(RuntimeError, "simulated"):
                            update.install(meta, target)
                    else:
                        update.install(meta, target)
                if failure == "cancel":
                    self.assertFalse(backups.exists())
                    self.assertNotIn(["systemctl", "stop", update.SERVICE], commands)
                    return
                backup = next(backups.iterdir())
                state = json.loads((backup / "state.json").read_text())
                self.assertEqual(backup.stat().st_mode & 0o777, 0o700)
                self.assertEqual((backup / "runtime.env").stat().st_mode & 0o777, 0o600)
                self.assertEqual(snippet.read_text(), previous if failure else f"root {home / 'releases' / meta['update'] / 'web'};\n")
                if failure == "backup":
                    self.assertEqual(state["phase"], "failed_before_migration")
                    self.assertIn(["systemctl", "start", update.SERVICE], commands)
                    self.assertFalse(any(args[0] == "java" for args in commands))
                elif failure == "activation":
                    self.assertEqual(state["phase"], "failed_after_migration")
                    last_stop = max(index for index, args in enumerate(commands) if args == ["systemctl", "stop", update.SERVICE])
                    self.assertNotIn(["systemctl", "start", update.SERVICE], commands[last_stop + 1:])
                    self.assertFalse(override.exists())
                else:
                    self.assertEqual(state["phase"], "installed")
                    self.assertIn("--sos.upgrade-only=true", next(args for args in commands if args[0] == "java"))
                    dump = next(index for index, args in enumerate(commands) if args[0] == "pg_dump")
                    migration = next(index for index, args in enumerate(commands) if args[0] == "java")
                    self.assertLess(dump, migration)
                    self.assertTrue((backup / "uploads.tar.gz").is_file())
            finally:
                os.umask(initial_umask)

    def test_cancel_makes_no_service_or_backup_changes(self):
        self.exercise_install("cancel")

    def test_backup_failure_never_migrates_and_restores_service(self):
        self.exercise_install("backup")

    def test_activation_failure_preserves_backups_and_leaves_api_stopped(self):
        self.exercise_install("activation")

    def test_success_backups_precede_migration_and_versioned_activation(self):
        self.exercise_install(None)


if __name__ == "__main__":
    unittest.main()
