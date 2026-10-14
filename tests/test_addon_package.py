import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADDON = ROOT / "mttl_w01"
CONFIG = ADDON / "config.yaml"
DOCKERFILE = ADDON / "Dockerfile"
TUO_DOCKERFILE = ADDON / "backend" / "Dockerfile"
BACKEND_PY = ADDON / "backend" / "backend.py"
REPOSITORY = ROOT / "repository.yaml"
TRANSLATIONS = ADDON / "translations"
CHANGELOG = ADDON / "CHANGELOG.md"
BUILD_COPIES = ("NOTICE.md", "LICENSE")
VERSION_RE = r"^\d{2}\.([1-9]|1[0-2])\.(0|[1-9]\d*)$"

EXPECTED_PORTS = {"10086/tcp": "10086", "8080/tcp": "18282", "10080/tcp": "49217"}
EXPECTED_TRANSLATION_KEYS = {
    "configuration",
    "configuration.host_ip", "configuration.host_ip.name", "configuration.host_ip.description",
    "configuration.log_level", "configuration.log_level.name", "configuration.log_level.description",
    "network", *(f"network.{port}" for port in EXPECTED_PORTS),
}


def read_lines(path):
    return path.read_text(encoding="utf-8").splitlines()


def unquote(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def config_value(key):
    lines = [line for line in read_lines(CONFIG) if line.startswith(f"{key}: ")]
    assert len(lines) == 1, key
    return unquote(lines[0].split(":", 1)[1])


def yaml_block(path, key):
    """Read the `  child: value` lines (two-space indent) directly under the top-level `key:` line."""
    block = {}
    inside = False
    for line in read_lines(path):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith(" "):
            inside = line.rstrip() == f"{key}:"
            continue
        match = inside and re.match(r"^  (\S[^:]*):(?:\s+(.*))?$", line)
        if match:
            block[match.group(1)] = unquote(match.group(2) or "")
    return block


def yaml_tree(path):
    """Flatten nested `key: value` lines into {"a.b": "value"}; a key without a value maps to ""."""
    tree = {}
    parents = []  # (indent, key)
    for line in read_lines(path):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        key, _, value = line.strip().partition(":")
        while parents and parents[-1][0] >= indent:
            parents.pop()
        parents.append((indent, key))
        tree[".".join(name for _, name in parents)] = unquote(value)
    return tree


class AddonPackageTest(unittest.TestCase):
    def test_host_ip_schema_regex(self):
        prefix = "  host_ip: match("
        lines = [line for line in read_lines(CONFIG) if line.startswith(prefix)]
        self.assertEqual(len(lines), 1)
        self.assertTrue(lines[0].endswith(")?"), lines[0])
        rx = lines[0][len(prefix):-2]
        for ok in ("192.0.2.31", "198.51.100.7", "0.0.0.0", "255.255.255.255", "203.0.113.1"):
            self.assertTrue(re.fullmatch(rx, ok), ok)
        for bad in ("192.0.2", "256.1.1.1", "192.0.2.31.5", "homeassistant.local", "", "192.00.2.31", "192.0.02.1"):
            self.assertFalse(re.fullmatch(rx, bad), bad)

    def test_host_ip_not_in_options(self):
        options = yaml_block(CONFIG, "options")
        self.assertNotIn("host_ip", options)
        self.assertEqual(options, {"log_level": "INFO"})

    def test_ports_mapping(self):
        self.assertEqual(yaml_block(CONFIG, "ports"), EXPECTED_PORTS)
        self.assertEqual(set(yaml_block(CONFIG, "ports_description")), set(EXPECTED_PORTS))

    def test_required_settings(self):
        lines = read_lines(CONFIG)
        for line in ("slug: mttl_w01", "url: https://github.com/kkqq9320/ha-lgu-mttl-w01",
                     "image: ghcr.io/kkqq9320/mttl_w01",
                     "  - amd64", "  - aarch64", "  - mqtt:want", "hassio_api: true",
                     "ingress: true", "ingress_port: 8080",
                     "panel_title: MTTL-W01", "panel_icon: mdi:power-socket-de",
                     "  log_level: INFO"):
            self.assertIn(line, lines)
        # The add-on linter rejects `webui` with ingress, `watchdog` (health is checked by the Dockerfile
        # HEALTHCHECK) and keys that repeat a default (`startup: application`, `boot: auto`).
        for key in ("webui", "watchdog", "startup", "boot"):
            with self.subTest(key=key):
                self.assertFalse(any(line.startswith(f"{key}:") for line in lines))

    def test_dockerfile_healthcheck(self):
        checks = [line for line in read_lines(DOCKERFILE) if line.startswith("HEALTHCHECK")]
        self.assertEqual(len(checks), 1)
        check = checks[0]
        for part in ("--interval=", "--timeout=", "--start-period=", "--retries=",
                     " CMD wget ", "http://127.0.0.1:8080/api/health", "|| exit 1"):
            with self.subTest(part=part):
                self.assertIn(part, check)

    def test_version_is_calendar_version(self):
        self.assertRegex(config_value("version"), VERSION_RE)

    def test_description_names_backend_version(self):
        m = re.search(r"\(based on Tuo standalone (\d+\.\d+\.\d+)\)$", config_value("description"))
        backend = re.search(r"^BACKEND_VERSION='([^']+)'$", BACKEND_PY.read_text(encoding="utf-8"), re.MULTILINE)
        self.assertIsNotNone(m)
        self.assertIsNotNone(backend)
        self.assertEqual(m.group(1), backend.group(1))

    def test_changelog_top_matches_version(self):
        en, ko = CHANGELOG.read_text(encoding="utf-8").split("\n# 변경 기록\n")
        for part in (en, ko):
            first = next(line for line in part.splitlines() if line.startswith("## "))
            self.assertEqual(first, f"## {config_value('version')}")

    def test_dockerfile_copies_same_modules_as_tuo(self):
        def copy_sources(path):
            return [src for line in read_lines(path) if line.startswith("COPY ") for src in line.split()[1:-1]]

        ours = copy_sources(DOCKERFILE)
        self.assertTrue(ours)
        for src in ours:
            # NOTICE.md and LICENSE live at the repository root; the workflows and
            # tools/pack_local_app.py copy them into the build context first.
            base = ROOT if src in BUILD_COPIES else ADDON
            self.assertTrue((base / src).exists(), src)
        our_modules = {Path(src).name for src in ours if src.startswith("backend/") and src.endswith(".py")}
        tuo_modules = {Path(src).name for src in copy_sources(TUO_DOCKERFILE) if src.endswith(".py")}
        self.assertTrue(tuo_modules)
        self.assertEqual(our_modules, tuo_modules)

    def test_dockerfile_installs_notice_and_labels(self):
        lines = read_lines(DOCKERFILE)
        self.assertIn("COPY NOTICE.md LICENSE /usr/share/doc/mttl_w01/", lines)
        text = "\n".join(lines)
        self.assertRegex(text, r'org\.opencontainers\.image\.title="[^"]+"')
        description = re.search(r'org\.opencontainers\.image\.description="([^"]+)"', text)
        self.assertIsNotNone(description)
        self.assertIn("Tuo", description.group(1))
        self.assertIn("https://github.com/kkqq9320/ha-lgu-mttl-w01", description.group(1))
        self.assertLessEqual(len(description.group(1)), 512)

    def test_no_repository_yaml(self):
        # Users add kkqq9320/ha-apps; this repository is not an app repository.
        self.assertFalse(REPOSITORY.exists())

    def test_translations_match(self):
        trees = {}
        for lang in ("en", "ko"):
            tree = yaml_tree(TRANSLATIONS / f"{lang}.yaml")
            self.assertEqual(set(tree), EXPECTED_TRANSLATION_KEYS, lang)
            for key in EXPECTED_TRANSLATION_KEYS - {"configuration", "configuration.host_ip",
                                                    "configuration.log_level", "network"}:
                self.assertTrue(tree[key], f"{lang}: {key}")
            trees[lang] = tree
        self.assertEqual(set(trees["en"]), set(trees["ko"]))


if __name__ == "__main__":
    unittest.main()
