import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "mttl_w01" / "backend" / "backend.py"
STATIC = ROOT / "mttl_w01" / "backend" / "static"

# mttl-up-card.js runs inside the Home Assistant frontend, not under the Ingress path.
WEB_FILES = sorted(
    path
    for pattern in ("*.html", "*.js", "*.mjs")
    for path in STATIC.glob(pattern)
    if path.name != "mttl-up-card.js"
)

ABSOLUTE_PATH_PATTERNS = (
    re.compile(r"""['"`]/(?![/*])[A-Za-z?]"""),  # '/api/x', `/logs.html`
    re.compile(r"""(['"`])/\1"""),  # '/'
    re.compile(r"""(?:src|href)=/"""),  # href=/provision.zip
)


def absolute_paths(text):
    """Return the root-relative URL fragments in `text`; Ingress needs page-relative ones."""
    return [
        match.group(0)
        for pattern in ABSOLUTE_PATH_PATTERNS
        for match in pattern.finditer(text)
    ]


class WebPathsTest(unittest.TestCase):
    def test_web_files_found(self):
        self.assertTrue(WEB_FILES)
        self.assertIn("app.js", {path.name for path in WEB_FILES})

    def test_web_files_use_relative_paths(self):
        for path in WEB_FILES:
            with self.subTest(file=path.name):
                self.assertEqual(absolute_paths(path.read_text(encoding="utf-8")), [], path.name)

    def test_absolute_paths_detector(self):
        self.assertNotEqual(absolute_paths("api('/api/x');location.href='/';<a href=/y>"), [])
        self.assertEqual(
            absolute_paths("api('api/x');s.split(/[&<]/);document.cookie='a=1; Path=/;'"), []
        )

    def test_dashboard_has_no_innerhtml(self):
        # Device and outlet names come from users; the dashboard must set them as text only.
        for name in ("dashboard.mjs", "dashboard-core.mjs"):
            with self.subTest(file=name):
                src = (STATIC / name).read_text(encoding="utf-8")
                for sink in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"):
                    self.assertNotIn(sink, src)

    def test_frame_options_sameorigin(self):
        src = BACKEND.read_text(encoding="utf-8")
        self.assertIn("send_header('X-Frame-Options','SAMEORIGIN')", src)
        self.assertNotIn("'DENY'", src)


if __name__ == "__main__":
    unittest.main()
