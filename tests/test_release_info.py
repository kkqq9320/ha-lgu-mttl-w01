import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("release_info", ROOT / "tools" / "release_info.py")
m = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = m
_spec.loader.exec_module(m)

CONFIG = ('name: LG U+ Multitap (MTTL-W01)\nversion: "26.10.0"\nslug: mttl_w01\n'
          "url: https://github.com/kkqq9320/ha-lgu-mttl-w01\nimage: ghcr.io/kkqq9320/mttl_w01\n"
          "description: Local backend (based on Tuo standalone 0.2.11)\nports:\n  10086/tcp: 10086\n")


class ReleaseInfoTest(unittest.TestCase):
    def test_release_info_reads_config(self):
        self.assertEqual(m.release_info("v26.10.0", CONFIG), {
            "version": "26.10.0",
            "name": "LG U+ Multitap (MTTL-W01)",
            "description": "Local backend (based on Tuo standalone 0.2.11)",
            "url": "https://github.com/kkqq9320/ha-lgu-mttl-w01",
        })

    def test_config_values_unquotes_and_ignores_nested(self):
        values = m.config_values(CONFIG.replace('"26.10.0"', "'26.10.0'") + "# note: x\n")
        self.assertEqual(values["version"], "26.10.0")
        self.assertNotIn("10086/tcp", values)
        self.assertNotIn("ports", values)
        self.assertNotIn("# note", values)

    def test_config_values_reads_trailing_comments(self):
        for line in ('version: "26.10.0"  # first', "version: 26.10.0 # first", "version: '26.10.0'",
                     "version: 26.10.0\t# first"):
            with self.subTest(line=line):
                self.assertEqual(m.config_values(line + "\n")["version"], "26.10.0")
        for line in ('version: "26.10.0" x', 'version: "26.10.0', 'version: "26.10\\x2e0"'):
            with self.subTest(line=line), self.assertRaises(ValueError):
                m.config_values(line + "\n")

    def test_config_values_rejects_values_it_cannot_read(self):
        # Block scalars, tags, anchors, aliases and reserved indicators would otherwise be read as text.
        for text in ("name: >-\n  LG U+\n  Multitap\n", "name: |\n  X\n", "name: !!str X\n", "name: &a X\n",
                     "name: *a\n", "name: @x\n", "name: %x\n", "name: `x`\n"):
            with self.subTest(text=text), self.assertRaises(ValueError) as cm:
                m.config_values(text)
            self.assertIn("name", str(cm.exception))

    def test_config_values_rejects_plain_value_on_two_lines(self):
        with self.assertRaises(ValueError) as cm:
            m.config_values('description: Local backend\n  for the power strip\nversion: "26.10.0"\n')
        self.assertIn("description", str(cm.exception))

    def test_config_values_skips_flow_collections(self):
        values = m.config_values('arch: [amd64, aarch64]\nmap: {a: 1}\nversion: "26.10.0"\n')
        self.assertEqual(values, {"version": "26.10.0"})

    def test_config_values_rejects_repeated_key(self):
        with self.assertRaises(ValueError):
            m.config_values(CONFIG + 'version: "26.10.1"\n')

    def test_release_info_rejects_bad_tags(self):
        for tag in ("26.10.0", "v26.10.1", "v26.10.0-rc1", "v26.13.0", "v26.0.0", "V26.10.0", ""):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                m.release_info(tag, CONFIG)
        leading_zero = CONFIG.replace('"26.10.0"', '"26.09.0"')
        with self.assertRaises(ValueError):
            m.release_info("v26.09.0", leading_zero)

    def test_release_info_requires_each_value(self):
        for key in ("name", "description", "url"):
            text = "".join(line for line in CONFIG.splitlines(keepends=True) if not line.startswith(f"{key}:"))
            with self.subTest(key=key), self.assertRaises(ValueError):
                m.release_info("v26.10.0", text)

    def test_release_info_on_repository_config(self):
        text = (ROOT / "mttl_w01" / "config.yaml").read_text(encoding="utf-8")
        version = m.config_values(text)["version"]
        self.assertEqual(m.release_info("v" + version, text)["version"], version)

    def test_main_writes_github_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = Path(tmp) / "config.yaml"
            out = Path(tmp) / "output"
            cfg.write_bytes(CONFIG.encode())
            self.assertEqual(m.main(["v26.10.0", "--config", str(cfg), "--github-output", str(out)]), 0)
            lines = out.read_text(encoding="utf-8").splitlines()
            self.assertEqual(lines, ["version=26.10.0", "name=LG U+ Multitap (MTTL-W01)",
                                     "description=Local backend (based on Tuo standalone 0.2.11)",
                                     "url=https://github.com/kkqq9320/ha-lgu-mttl-w01"])
            self.assertEqual(m.main(["v26.10.9", "--config", str(cfg), "--github-output", str(out)]), 1)
            self.assertEqual(len(out.read_text(encoding="utf-8").splitlines()), 4)


if __name__ == "__main__":
    unittest.main()
