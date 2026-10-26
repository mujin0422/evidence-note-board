import hashlib
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts/backup-board.py"

class BackupRestoreTests(unittest.TestCase):
    def test_backup_verify_corruption_and_rollback(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp)/"data"
            live=base/"evidence-note-board"
            (live/"assets").mkdir(parents=True)
            image=b"sample PNG bytes (test only)"
            (live/"assets"/"a.png").write_bytes(image)
            with sqlite3.connect(live/"evidence.db") as conn:
                conn.executescript("""
                    CREATE TABLE notes(id TEXT PRIMARY KEY);
                    CREATE TABLE assets(file_path TEXT,checksum TEXT);
                    INSERT INTO notes VALUES('original');
                """)
                conn.execute("INSERT INTO assets VALUES(?,?)",
                    ("a.png",hashlib.sha256(image).hexdigest()))
            # Mock ONLY the systemctl executable used by test subprocesses.
            # A real GNOME desktop may have the actual user service active;
            # this fixture must never query/stop/modify that real service.
            # Production backup-board.py still rejects restore while active.
            test_bin=Path(temp)/"test-bin"
            test_bin.mkdir()
            systemctl=test_bin/"systemctl"
            systemctl.write_text(
                "#!/bin/sh\\n"
                "if [ \\"$1\\" != \\"--user\\" ] || [ \\"$2\\" != \\"is-active\\" ] || "
                "[ \\"$3\\" != \\"--quiet\\" ] || "
                "[ \\"$4\\" != \\"evidence-note-board.service\\" ]; then exit 99; fi\\n"
                "if [ \\"${ENB_TEST_SYSTEMCTL_ACTIVE:-0}\\" = \\"1\\" ]; "
                "then exit 0; fi\\n"
                "exit 3\\n",
                encoding="utf-8")
            systemctl.chmod(0o755)
            env={**os.environ,"XDG_DATA_HOME":str(base),
                "PATH":str(test_bin)+os.pathsep+os.environ.get("PATH","")}
            def cmd(*args,expect=0,service_active=False):
                local_env={**env,
                    "ENB_TEST_SYSTEMCTL_ACTIVE":"1" if service_active else "0"}
                result=subprocess.run([sys.executable,str(SCRIPT),*args],
                    env=local_env,capture_output=True,text=True)
                self.assertEqual(result.returncode,expect,
                    msg=result.stdout+result.stderr)
                return result
            output=Path(temp)/"snapshot"
            cmd("backup","--output",str(output))
            cmd("verify",str(output))
            (live/"assets"/"a.png").write_bytes(b"changed")
            self.assertEqual(cmd("verify",str(live),expect=1).returncode,1)
            cmd("restore",str(output),expect=2)
            # Safety regression: a running backend MUST block restore even
            # with --confirm. It must not touch the live DB/assets.
            blocked=cmd("restore",str(output),"--confirm",
                service_active=True,expect=1)
            self.assertIn("Stop evidence-note-board.service",blocked.stderr)
            self.assertEqual((live/"assets"/"a.png").read_bytes(),b"changed")
            self.assertFalse((live/"restore-rollback").exists())
            # Once the mocked service is inactive, restore proceeds safely.
            cmd("restore",str(output),"--confirm")
            cmd("verify",str(live))
            self.assertEqual((live/"assets"/"a.png").read_bytes(),image)
            self.assertTrue(list((live/"restore-rollback").iterdir()))
            (output/"assets"/"a.png").write_bytes(b"tamper")
            cmd("verify",str(output),expect=1)

if __name__=="__main__":
    unittest.main()
