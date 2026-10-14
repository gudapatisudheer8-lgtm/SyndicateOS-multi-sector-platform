#!/usr/bin/env python3
"""Guarded, data-preserving update of the existing lowercase-sos EC2 installation."""
import argparse
from datetime import datetime, timezone
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import socket
import subprocess
import tarfile
import time

ROOT = Path(__file__).resolve().parent
HOME = Path("/opt/syndicateos")
CURRENT = HOME / "current"
SNIPPET = Path("/etc/nginx/snippets/syndicateos-fresh.conf")
ENV_FILE = Path("/etc/syndicateos/runtime.env")
UPLOADS = Path("/var/lib/syndicateos/uploads")
OVERRIDE = Path("/etc/systemd/system/syndicateos-api.service.d/zz-sos-consolidated.conf")
BACKUPS = Path("/opt/syndicateos-update-backups")
SERVICE = "syndicateos-api"
BASE = "sos-fresh-ec2-20261010"
SCHEMA = 23
SAFE_ENV = {"PATH": "/usr/bin:/bin", "HOME": "/root", "LANG": "C.UTF-8"}


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def output(args, **kwargs):
    return run(args, text=True, capture_output=True, **kwargs).stdout.strip()


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_files(root):
    root = root.resolve()
    seen = set()
    for line in (root / "FILES.sha256").read_text().splitlines():
        expected, relative = line.split("  ", 1)
        path = root / relative
        if (not re.fullmatch(r"[a-f0-9]{64}", expected) or relative in seen
                or Path(relative).is_absolute() or ".." in Path(relative).parts
                or path.is_symlink() or not path.resolve().is_relative_to(root)
                or not path.is_file() or digest(path) != expected):
            raise RuntimeError("Unsafe, missing or modified package file: " + relative)
        seen.add(relative)
    if not {"update.py", "update.json", "sos-api.jar", "web/index.html", "web/release.json", "permissions.sql"} <= seen:
        raise RuntimeError("Incomplete update manifest.")
    meta = json.loads((root / "update.json").read_text())
    if (not re.fullmatch(r"sos-consolidated-[a-z0-9-]{1,50}", meta["update"])
            or meta["base_release"] != BASE or meta["schema_version"] != SCHEMA
            or meta["api_sha256"] != digest(root / "sos-api.jar")
            or meta["index_sha256"] != digest(root / "web/index.html")):
        raise RuntimeError("Invalid release metadata.")
    return meta


def api_command(service_text, jar):
    commands = []
    for line in service_text.splitlines():
        if line.startswith("ExecStart="):
            value = line[len("ExecStart="):]
            if not value:
                commands.clear()
            else:
                commands.append(value)
    if len(commands) != 1:
        raise RuntimeError("Unsupported effective systemd command; no changes made.")
    command = commands[0]
    pattern = r"(-jar\s+)(/opt/syndicateos/(?:current|(?:api-fixes|releases|frontend-fixes)/[a-z0-9-]+)/sos-api\.jar)(?=\s|$)"
    if (len(re.findall(pattern, command)) != 1 or "--server.address=127.0.0.1" not in command
            or "--spring.flyway.enabled=false" not in command
            or "--sos.setup-approved=false" not in command or "--sos.preview-fixture=false" not in command):
        raise RuntimeError("Unexpected API command or migration/binding settings; no changes made.")
    return re.sub(pattern, lambda match: match[1] + str(jar), command)


def routing_root(text):
    roots = re.findall(r"(?m)^root (/opt/syndicateos/(?:current/web|(?:frontend-fixes|releases)/[a-z0-9-]+/web));$", text)
    if len(roots) != 1:
        raise RuntimeError("Unexpected SOS Nginx root; stop for review.")
    return roots[0]


def https(domain, path):
    return run(["curl", "--fail", "--silent", "--show-error", "--max-time", "10",
                "--noproxy", "*", "--resolve", f"{domain}:443:127.0.0.1",
                "-H", "Cache-Control: no-cache", f"https://{domain}{path}"],
               capture_output=True).stdout


def preflight():
    if os.geteuid() != 0:
        raise RuntimeError("Use sudo. No changes made.")
    meta = verify_files(ROOT)
    for tool in ("java", "psql", "pg_dump", "pg_restore", "nginx", "systemctl", "curl"):
        if not shutil.which(tool):
            raise RuntimeError("Missing required tool: " + tool)
    target = json.loads((CURRENT / "deployment.json").read_text())
    if (target["release"] != BASE or target["database_name"] != "sos"
            or target["migration_role"] != "sos_deploy" or target["runtime_role"] != "sos_runtime"
            or target["schema_version"] != "19" or target["domain"] != "sos.krishisetu9.in"):
        raise RuntimeError("This updater is only for the existing fresh-20261010 lowercase-sos installation.")
    # Check only non-secret target settings. Never print or rewrite runtime credentials.
    keys = {"SOS_DB_HOST", "SOS_DB_PORT", "SOS_DB_NAME", "SOS_DB_USERNAME"}
    settings = {}
    for line in ENV_FILE.read_text().splitlines():
        key, separator, value = line.partition("=")
        if separator and key in keys:
            parsed = shlex.split(value)
            if len(parsed) != 1:
                raise RuntimeError("Unexpected runtime target format.")
            settings[key] = parsed[0]
    expected = {"SOS_DB_HOST": target["database_host"], "SOS_DB_PORT": target["database_port"],
                "SOS_DB_NAME": "sos", "SOS_DB_USERNAME": "sos_runtime"}
    if settings != expected:
        raise RuntimeError("Runtime target differs from base deployment metadata; stop for review.")
    if not (CURRENT / "certs/aws-rds-global-bundle.pem").is_file() or not UPLOADS.is_dir():
        raise RuntimeError("Existing RDS CA or private uploads directory is missing.")
    version = run(["java", "-version"], capture_output=True, text=True)
    major = re.search(r'version "(\d+)', version.stderr + version.stdout)
    if not major or int(major[1]) < 21:
        raise RuntimeError("Java 21 or newer is required.")
    api_command(output(["systemctl", "cat", SERVICE]), HOME / "releases" / meta["update"] / "sos-api.jar")
    routing_root(SNIPPET.read_text())
    run(["nginx", "-t"])
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 8091))
    return meta, target


def database_env(target, password):
    return {**SAFE_ENV, "PGHOST": target["database_host"], "PGPORT": target["database_port"],
            "PGDATABASE": "sos", "PGUSER": "sos_deploy", "PGPASSWORD": password,
            "PGSSLMODE": "verify-full", "PGSSLROOTCERT": str(CURRENT / "certs/aws-rds-global-bundle.pem"),
            "PGCONNECT_TIMEOUT": "10"}


def query(env, sql):
    return output(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql], env=env)


def database_check(env):
    result = json.loads(query(env, """SELECT json_build_object(
        'database',current_database(), 'role',current_user,
        'owners',(SELECT count(*) FROM sos.owner_memberships),
        'version',(SELECT max(version::integer) FROM sos.flyway_schema_history WHERE success),
        'failed',(SELECT count(*) FROM sos.flyway_schema_history WHERE NOT success),
        'server',current_setting('server_version_num')::integer,
        'size',pg_database_size(current_database()))"""))
    if (result["database"] != "sos" or result["role"] != "sos_deploy" or result["owners"] < 1
            or result["failed"] or result["version"] not in (19, 20, 21, 22, 23)):
        raise RuntimeError("Unexpected database target, owner or migration history; no changes made.")
    client = re.search(r"(\d+)\.", output(["pg_dump", "--version"]))
    if not client or int(client[1]) < result["server"] // 10000:
        raise RuntimeError(f"pg_dump is older than the RDS PostgreSQL server ({result['server'] // 10000}). Install a matching/newer PostgreSQL client before continuing. No services stopped.")
    return result


def save_state(backup, state):
    (backup / "state.json").write_text(json.dumps(state, indent=2) + "\n")
    (backup / "state.json").chmod(0o600)


def restore_configuration(backup):
    if backup.parent != BACKUPS or backup.is_symlink():
        raise RuntimeError("Invalid backup location.")
    state = json.loads((backup / "state.json").read_text())
    if state["base_release"] != BASE:
        raise RuntimeError("Unexpected backup metadata.")
    run(["systemctl", "stop", SERVICE])
    SNIPPET.write_bytes((backup / "nginx.conf").read_bytes())
    if state["override_existed"]:
        OVERRIDE.write_bytes((backup / "previous-override.conf").read_bytes())
    else:
        OVERRIDE.unlink(missing_ok=True)
    run(["systemctl", "daemon-reload"])
    run(["nginx", "-t"])
    run(["systemctl", "reload", "nginx"])
    return state


def verify(meta, target, wait=0):
    destination = HOME / "releases" / meta["update"]
    deadline = time.monotonic() + wait
    while True:
        try:
            run(["systemctl", "is-active", "--quiet", SERVICE])
            active = output(["systemctl", "show", "-p", "ExecStart", "--value", SERVICE])
            if str(destination / "sos-api.jar") not in active or digest(destination / "sos-api.jar") != meta["api_sha256"]:
                raise RuntimeError("Active API command/binary is not this update.")
            ready = json.loads(https(target["domain"], "/api/readyz"))
            if ready.get("status") != "ready" or not ready.get("targetVerified"):
                raise RuntimeError("API is not ready on its expected target.")
            release = json.loads(https(target["domain"], "/release.json"))
            if release.get("frontend_fix") != meta["update"] or release.get("schema_version") != str(SCHEMA):
                raise RuntimeError("HTTPS is not serving the expected frontend release.")
            for route in ("/", "/owner"):
                if hashlib.sha256(https(target["domain"], route)).hexdigest() != meta["index_sha256"]:
                    raise RuntimeError("HTTPS index content mismatch: " + route)
            print(f"Verified {meta['update']}: correct API binary, readiness and HTTPS frontend.")
            return
        except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError):
            if time.monotonic() >= deadline:
                raise
            time.sleep(2)


def install(meta, target):
    password = getpass.getpass("Existing sos_deploy database password (hidden): ")
    if not password or any(character in password for character in "\r\n\0"):
        raise RuntimeError("Invalid database password input.")
    env = database_env(target, password)
    db = database_check(env)
    run(["systemctl", "is-active", "--quiet", SERVICE])
    if json.loads(https(target["domain"], "/api/readyz")).get("status") != "ready":
        raise RuntimeError("Existing API is not ready; stop for diagnosis before updating.")
    package_bytes = sum(path.stat().st_size for path in ROOT.rglob("*") if path.is_file())
    upload_bytes = sum(path.stat().st_size for path in UPLOADS.rglob("*") if path.is_file())
    if shutil.disk_usage(HOME).free < package_bytes * 2 + upload_bytes * 2 + db["size"] * 2 + 256 * 1024 * 1024:
        raise RuntimeError("Not enough local free space for the versioned release and backups.")
    destination = HOME / "releases" / meta["update"]
    command = api_command(output(["systemctl", "cat", SERVICE]), destination / "sos-api.jar")
    if input(f"Brief downtime; back up lowercase sos and uploads, then upgrade to V{SCHEMA}. Type UPDATE SOS: ").strip().upper() != "UPDATE SOS":
        print("Cancelled. No service or database changes made.")
        return
    os.umask(0o077)
    BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
    BACKUPS.chmod(0o700)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = BACKUPS / f"{meta['update']}-{stamp}"
    backup.mkdir(mode=0o700)
    state = {"base_release": BASE, "update": meta["update"], "schema_before": db["version"],
             "override_existed": OVERRIDE.exists(), "phase": "before_backup"}
    (backup / "nginx.conf").write_bytes(SNIPPET.read_bytes())
    if OVERRIDE.exists():
        (backup / "previous-override.conf").write_bytes(OVERRIDE.read_bytes())
    shutil.copy2(ENV_FILE, backup / "runtime.env")
    (backup / "runtime.env").chmod(0o600)
    save_state(backup, state)
    print("Private recovery directory:", backup, flush=True)
    migration_started = False
    try:
        run(["systemctl", "stop", SERVICE])
        run(["pg_dump", "--format=custom", "--no-owner", "--no-acl", "--schema=sos",
             "--file", str(backup / "sos.dump")], env=env, timeout=600)
        if (backup / "sos.dump").stat().st_size < 100:
            raise RuntimeError("Database backup is empty.")
        run(["pg_restore", "--list", str(backup / "sos.dump")], stdout=subprocess.DEVNULL)
        with tarfile.open(backup / "uploads.tar.gz", "w:gz") as archive:
            archive.add(UPLOADS, arcname="uploads")
        state["database_backup_sha256"] = digest(backup / "sos.dump")
        state["uploads_backup_sha256"] = digest(backup / "uploads.tar.gz")
        state["phase"] = "backed_up"
        save_state(backup, state)
        if destination.exists():
            if verify_files(destination) != meta:
                raise RuntimeError("Installed release directory does not match this package.")
        else:
            destination.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
            destination.parent.chmod(0o755)
            shutil.copytree(ROOT, destination)
        for path in [destination, *destination.rglob("*")]:
            path.chmod(0o755 if path.is_dir() else 0o644)
        verify_files(destination)
        migration_env = {**SAFE_ENV, "SOS_DB_HOST": target["database_host"], "SOS_DB_PORT": target["database_port"],
            "SOS_DB_NAME": "sos", "SOS_DB_USERNAME": "sos_deploy", "SOS_DB_PASSWORD": password,
            "SOS_RDS_CA_FILE": str(CURRENT / "certs/aws-rds-global-bundle.pem"),
            "SOS_DB_READ_ONLY": "false", "SOS_ENABLE_WRITES": "false"}
        state["phase"] = "migration_started"
        save_state(backup, state)
        migration_started = True
        run(["java", "-Xms64m", "-Xmx256m", "-jar", str(destination / "sos-api.jar"),
             "--server.address=127.0.0.1", "--server.port=8091",
             "--server.tomcat.threads.max=16", "--server.tomcat.threads.min-spare=2",
             "--sos.setup-approved=true", "--sos.upgrade-only=true", "--sos.setup-exit=true",
             "--sos.writes-enabled=false", "--sos.preview-fixture=false",
             "--spring.flyway.enabled=false", "--spring.datasource.hikari.read-only=false"],
            env=migration_env, cwd=destination, timeout=600)
        run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-f", str(destination / "permissions.sql")], env=env)
        after = database_check(env)
        if after["version"] != SCHEMA or after["owners"] != db["owners"]:
            raise RuntimeError("Migration version or owner count mismatch.")
        state["phase"] = "migrated"
        save_state(backup, state)
        OVERRIDE.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
        OVERRIDE.write_text("[Service]\nExecStart=\nExecStart=" + command + "\n")
        OVERRIDE.chmod(0o644)
        previous_routing = (backup / "nginx.conf").read_text()
        SNIPPET.write_text(previous_routing.replace("root " + routing_root(previous_routing) + ";",
                                                   f"root {destination / 'web'};"))
        run(["nginx", "-t"])
        run(["systemctl", "daemon-reload"])
        run(["systemctl", "start", SERVICE])
        run(["systemctl", "reload", "nginx"])
        verify(meta, target, wait=120)
        state["phase"] = "installed"
        save_state(backup, state)
        print(f"Schema V{SCHEMA} verified. Existing owner, firm assignments, credentials and uploads preserved.")
        print("Original checksummed deployment preserved. Complete README.md signed-in acceptance checks.")
        print("Permanent verifier:", destination / "update.py")
    except BaseException:
        restore_configuration(backup)
        state["phase"] = "failed_after_migration" if migration_started else "failed_before_migration"
        save_state(backup, state)
        if not migration_started:
            run(["systemctl", "start", SERVICE])
            print("Prior service restored; no migration was attempted.")
        else:
            print("Prior routing/service override restored; SOS LEFT STOPPED for safe diagnosis.")
            print("Do not initialize, clean, delete migration history or restore an entire shared RDS instance.")
        print("Keep the private backup directory. No database rollback or deletion was performed.")
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("inspect", "install", "verify", "rollback"))
    parser.add_argument("backup", nargs="?")
    args = parser.parse_args()
    if args.command == "rollback":
        if os.geteuid() != 0 or not args.backup:
            parser.error("Use sudo and supply the exact printed backup directory.")
        backup = Path(args.backup).resolve()
        restore_configuration(backup)
        print("Prior routing and service override restored. API remains STOPPED.")
        print("Database and upload backups were NOT restored. Review any post-update writes before recovery.")
        return
    meta, target = preflight()
    if args.command == "inspect":
        print("Package, existing installation, runtime target, Java, Nginx and setup port verified.")
        print("Database credentials/history and pg_dump compatibility are checked before install stops anything.")
        print("No service, credential, upload or database changes made.")
    elif args.command == "verify":
        verify(meta, target, wait=30)
    else:
        install(meta, target)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit(str(error))
