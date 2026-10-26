#!/usr/bin/env python3
"""Offline-first SQLite + asset snapshots. No network or third-party deps.

backup: SQLite online backup API, then copy referenced assets and verify.
verify: integrity_check, foreign keys and SHA256 of every referenced asset.
restore: EXPLICIT action, refuses when the user service is running; preserves
         original database, WAL and assets under restore-rollback/ before copy.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import uuid


def data_root():
    """Return the absolute XDG directory containing live board data."""
    base = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share")))
    if not base.is_absolute():
        raise ValueError("XDG_DATA_HOME must be absolute")
    return base / "evidence-note-board"


def safe_asset(name):
    """Accept only a plain backend-generated filename, never a path."""
    if not isinstance(name, str) or not name or Path(name).name != name or "/" in name or "\\" in name:
        raise ValueError("Unsafe asset name in database")
    return name


def sha256(path):
    """Hash a file incrementally so large assets are not duplicated in memory."""
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify(folder):
    """Verify SQLite integrity and every asset referenced by a snapshot."""
    database = folder / "evidence.db"
    if not database.is_file():
        raise ValueError(f"Missing evidence.db in {folder}")
    with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as conn:
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("SQLite integrity_check failed")
        if conn.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("SQLite foreign_key_check failed")
        references = conn.execute("SELECT file_path, checksum FROM assets").fetchall()
        count = conn.execute("SELECT count(*) FROM notes").fetchone()[0]
    for name, expected in references:
        path = folder / "assets" / safe_asset(name)
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"Missing or invalid asset: {name}")
        if sha256(path) != expected:
            raise ValueError(f"Checksum mismatch for asset: {name}")
    return {"notes": count, "assets": len(references)}


def make_backup(root, output=None):
    """Create and verify a consistent SQLite/asset snapshot."""
    original = root / "evidence.db"
    if not original.is_file():
        raise ValueError(f"Database not found: {original}")
    dest = output or root / "backups" / (
        datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8])
    if dest.exists():
        raise ValueError(f"Backup destination already exists: {dest}")
    dest.mkdir(parents=True, mode=0o700)
    try:
        snapshot = dest / "evidence.db"
        with sqlite3.connect(f"file:{original}?mode=ro", uri=True) as source:
            with sqlite3.connect(snapshot) as target:
                source.backup(target)
        with sqlite3.connect(snapshot) as conn:
            references = conn.execute("SELECT file_path FROM assets").fetchall()
        (dest / "assets").mkdir(mode=0o700)
        for (name,) in references:
            name = safe_asset(name)
            src = root / "assets" / name
            if src.is_symlink() or not src.is_file():
                raise ValueError(f"Referenced asset is missing: {name}")
            shutil.copyfile(src, dest / "assets" / name)
        details = verify(dest)
        (dest / "manifest.json").write_text(
            json.dumps(details, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return dest, details
    except Exception:
        shutil.rmtree(dest)
        raise


def service_running():
    """Return whether the user backend is active, if systemd is available."""
    if shutil.which("systemctl") is None:
        return False
    result = subprocess.run(
        ["systemctl", "--user", "is-active", "--quiet", "evidence-note-board.service"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    return result.returncode == 0


def restore(root, source):
    """Replace live data while keeping the previous state as a rollback."""
    if service_running():
        raise ValueError("Stop evidence-note-board.service AND disable the GNOME extension before restore")
    stats = verify(source)
    root.mkdir(parents=True, exist_ok=True)
    rollback = root / "restore-rollback" / (
        datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8])
    rollback.mkdir(parents=True, mode=0o700)
    names = ["evidence.db", "evidence.db-wal", "evidence.db-shm", "assets"]
    moved = []
    try:
        for name in names:
            path = root / name
            if path.exists():
                path.rename(rollback / name)
                moved.append(name)
        shutil.copy2(source / "evidence.db", root / "evidence.db")
        shutil.copytree(source / "assets", root / "assets")
        verify(root)
    except Exception:
        for name in ["evidence.db", "evidence.db-wal", "evidence.db-shm"]:
            (root / name).unlink(missing_ok=True)
        if (root / "assets").exists():
            shutil.rmtree(root / "assets")
        for name in moved:
            (rollback / name).rename(root / name)
        raise
    return rollback, stats


def main():
    """Parse the command line and dispatch backup, verify or restore."""
    parser = argparse.ArgumentParser(description="Evidence Board local SQLite/asset recovery")
    actions = parser.add_subparsers(dest="action", required=True)
    backup = actions.add_parser("backup")
    backup.add_argument("--output", type=Path)
    check = actions.add_parser("verify")
    check.add_argument("folder", type=Path)
    recover = actions.add_parser("restore")
    recover.add_argument("folder", type=Path)
    recover.add_argument("--confirm", action="store_true",
        help="Explicitly replace the live data; old data is moved to restore-rollback/")
    args = parser.parse_args()
    root = data_root()
    if args.action == "backup":
        dest, info = make_backup(root, args.output)
        print(f"BACKUP OK: {dest} ({info['notes']} notes, {info['assets']} assets)")
    elif args.action == "verify":
        info = verify(args.folder)
        print(f"VERIFY OK: {info['notes']} notes, {info['assets']} assets")
    else:
        if not args.confirm:
            parser.error("restore requires --confirm (old data is preserved as rollback)")
        recovery, info = restore(root, args.folder)
        print(f"RESTORE OK: {info['notes']} notes; previous data at {recovery}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, sqlite3.Error) as error:
        print(f"Evidence Board recovery: {error}", file=sys.stderr)
        raise SystemExit(1)
