import importlib.util
import io
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("pack_local_app", ROOT / "tools" / "pack_local_app.py")
m = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = m
_spec.loader.exec_module(m)

SAMPLE = "name: X\nimage: ghcr.io/kkqq9320/mttl_w01\nservices:\n  - mqtt:want\noptions:\n  log_level: INFO\n"


def tar_members(repo, keep_mqtt=False):
    buf = io.BytesIO()
    m.write_tar(repo, buf, keep_mqtt=keep_mqtt)
    buf.seek(0)
    with tarfile.open(fileobj=buf) as tar:
        return {member.name: tar.extractfile(member).read() for member in tar.getmembers()}, \
            [member.name for member in tar.getmembers()]


class LocalConfigTest(unittest.TestCase):
    def test_local_config_comments_image_and_services(self):
        out = m.local_config(SAMPLE).splitlines()
        self.assertEqual(out, ["name: X", "#image: ghcr.io/kkqq9320/mttl_w01", "#services:", "#  - mqtt:want",
                               "options:", "  log_level: INFO"])

    def test_local_config_keep_mqtt(self):
        out = m.local_config(SAMPLE, keep_mqtt=True).splitlines()
        self.assertIn("#image: ghcr.io/kkqq9320/mttl_w01", out)
        self.assertIn("services:", out)
        self.assertIn("  - mqtt:want", out)

    def test_local_config_requires_image_line(self):
        with self.assertRaises(ValueError):
            m.local_config(SAMPLE.replace("image:", "img:"))
        with self.assertRaises(ValueError):
            m.local_config(SAMPLE.replace("services:", "svc:"))
        with self.assertRaises(ValueError):
            m.local_config(SAMPLE + "image: ghcr.io/kkqq9320/other\n")

    def test_local_config_handles_variants(self):
        text = ("name: X\nimage: ghcr.io/kkqq9320/mttl_w01  # prebuilt\nservices:\n"
                "  - mqtt:want\n  - mysql:need\noptions:\n  log_level: INFO\n")
        out = m.local_config(text).splitlines()
        self.assertEqual(out, ["name: X", "#image: ghcr.io/kkqq9320/mttl_w01  # prebuilt", "#services:",
                               "#  - mqtt:want", "#  - mysql:need", "options:", "  log_level: INFO"])
        # A YAML list may also start in column 0 under its key.
        flush = m.local_config(SAMPLE.replace("  - mqtt:want", "- mqtt:want")).splitlines()
        self.assertEqual(flush[2:4], ["#services:", "#- mqtt:want"])
        self.assertEqual(flush[4], "options:")

    def test_local_config_on_repository_config(self):
        src = (ROOT / "mttl_w01" / "config.yaml").read_text(encoding="utf-8")
        out = m.local_config(src)
        self.assertEqual(len(src.splitlines()), len(out.splitlines()))
        changed = [(a, b) for a, b in zip(src.splitlines(), out.splitlines()) if a != b]
        self.assertTrue(all(b == "#" + a for a, b in changed), changed)
        self.assertEqual({a.split(":")[0].strip() for a, _ in changed}, {"image", "services", "- mqtt"})


class TarTest(unittest.TestCase):
    def test_tar_contents(self):
        files, names = tar_members(ROOT)
        self.assertTrue(all(n.startswith("mttl_w01/") and "\\" not in n for n in names), names)
        self.assertEqual(len(names), len(set(names)))
        self.assertFalse(any("__pycache__" in n or n.endswith(".pyc") for n in names))
        for n in ("mttl_w01/config.yaml", "mttl_w01/run.py", "mttl_w01/Dockerfile",
                  "mttl_w01/backend/backend.py", "mttl_w01/NOTICE.md", "mttl_w01/LICENSE"):
            self.assertIn(n, names)
        self.assertEqual(files["mttl_w01/NOTICE.md"], (ROOT / "NOTICE.md").read_bytes())
        self.assertEqual(files["mttl_w01/LICENSE"], (ROOT / "LICENSE").read_bytes())
        config = files["mttl_w01/config.yaml"].decode("utf-8")
        self.assertIn("\n#image: ", config)
        self.assertIn("\n#services:", config)
        self.assertEqual(files["mttl_w01/run.py"], (ROOT / "mttl_w01" / "run.py").read_bytes())

    def test_tar_keep_mqtt(self):
        files, _ = tar_members(ROOT, keep_mqtt=True)
        config = files["mttl_w01/config.yaml"].decode("utf-8")
        self.assertIn("\n#image: ", config)
        self.assertIn("\nservices:\n  - mqtt:want\n", config)

    def test_tar_takes_tracked_files_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            app = repo / "mttl_w01"
            (app / "backend" / "__pycache__").mkdir(parents=True)
            (app / "config.yaml").write_bytes(SAMPLE.encode())
            (app / "backend" / "backend.py").write_bytes(b"x = 1\n")
            (app / "backend" / "gone.py").write_bytes(b"x = 2\n")
            (repo / "NOTICE.md").write_bytes(b"notice\n")
            (repo / "LICENSE").write_bytes(b"license\n")
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            subprocess.run(["git", "-C", str(repo), "add", "mttl_w01"], check=True)
            # Left out: an untracked local file, caches, git-ignored build copies, a tracked file deleted on disk.
            (app / "backend" / ".env").write_bytes(b"SECRET=1\n")
            (app / "backend" / "__pycache__" / "backend.cpython-312.pyc").write_bytes(b"\0")
            (app / "stale.pyc").write_bytes(b"\0")
            (app / "NOTICE.md").write_bytes(b"stale copy\n")
            (app / "LICENSE").write_bytes(b"stale copy\n")
            (app / "backend" / "gone.py").unlink()
            files, names = tar_members(repo)
        self.assertEqual(names, sorted(names))
        self.assertEqual(names, ["mttl_w01/LICENSE", "mttl_w01/NOTICE.md",
                                 "mttl_w01/backend/backend.py", "mttl_w01/config.yaml"])
        self.assertEqual(files["mttl_w01/NOTICE.md"], b"notice\n")
        self.assertEqual(files["mttl_w01/LICENSE"], b"license\n")

    def test_bad_config_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "mttl_w01").mkdir()
            (repo / "mttl_w01" / "config.yaml").write_bytes(b"name: X\n")
            (repo / "NOTICE.md").write_bytes(b"notice\n")
            (repo / "LICENSE").write_bytes(b"license\n")
            out = io.BytesIO()
            with self.assertRaises(ValueError):
                m.write_tar(repo, out)
        # A partial stream would let `tar -x` on the HA host overwrite part of the app folder.
        self.assertEqual(out.getvalue(), b"")


if __name__ == "__main__":
    unittest.main()
