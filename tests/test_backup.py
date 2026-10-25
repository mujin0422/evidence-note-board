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
            env={**os.environ,"XDG_DATA_HOME":str(base)}
            def cmd(*args,expect=0):
                result=subprocess.run([sys.executable,str(SCRIPT),*args],
                    env=env,capture_output=True,text=True)
                self.assertEqual(result.returncode,expect,
                    msg=result.stdout+result.stderr)
                return result
            output=Path(temp)/"snapshot"
            cmd("backup","--output",str(output))
            cmd("verify",str(output))
            (live/"assets"/"a.png").write_bytes(b"changed")
            self.assertEqual(cmd("verify",str(live),expect=1).returncode,1)
            cmd("restore",str(output),expect=2)
            cmd("restore",str(output),"--confirm")
            cmd("verify",str(live))
            self.assertEqual((live/"assets"/"a.png").read_bytes(),image)
            self.assertTrue(list((live/"restore-rollback").iterdir()))
            (output/"assets"/"a.png").write_bytes(b"tamper")
            cmd("verify",str(output),expect=1)

if __name__=="__main__":
    unittest.main()
