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
        for name in (
            "dashboard.mjs", "dashboard-core.mjs", "firmware-core.mjs", "qr.mjs", "logview.mjs", "page.mjs",
            "settings.mjs", "settings-core.mjs",
        ):
            with self.subTest(file=name):
                src = (STATIC / name).read_text(encoding="utf-8")
                for sink in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"):
                    self.assertNotIn(sink, src)

    def test_routes_serve_dashboard(self):
        src = BACKEND.read_text(encoding="utf-8")
        html = "text/html; charset=utf-8"
        js = "application/javascript; charset=utf-8"
        self.assertIn("if p=='/':return self.send_file(self.root/'static/dashboard.html'", src)
        for route, file, ctype in (
            ("/", "dashboard.html", html),
            # The demo log page links back to dashboard.html?demo, which a plain static preview serves too.
            ("/dashboard.html", "dashboard.html", html),
            ("/dashboard.css", "dashboard.css", "text/css; charset=utf-8"),
            ("/dashboard.mjs", "dashboard.mjs", js),
            ("/dashboard-core.mjs", "dashboard-core.mjs", js),
            ("/settings.html", "settings.html", html),
            ("/settings.mjs", "settings.mjs", js),
            ("/settings-core.mjs", "settings-core.mjs", js),
            ("/firmware-core.mjs", "firmware-core.mjs", js),
            ("/settings.css", "settings.css", "text/css; charset=utf-8"),
            ("/qr.mjs", "qr.mjs", js),
            ("/logs.html", "logview.html", html),
            # The demo dashboard links to logview.html?demo, which a plain static preview serves too.
            ("/logview.html", "logview.html", html),
            ("/logview.mjs", "logview.mjs", js),
            ("/page.mjs", "page.mjs", js),
        ):
            with self.subTest(route=route):
                self.assertTrue((STATIC / file).is_file(), file)
                self.assertIn(
                    f"if p=='{route}':return self.send_file(self.root/'static/{file}','{ctype}',cache='no-cache')", src
                )
        # 투오's own log page stays in the repository but is no longer served.
        self.assertNotIn("'static/logs.html'", src)
        self.assertNotIn("'static/logs.js'", src)

    def test_tuo_page_not_routed(self):
        # 투오's own page and script stay in the repository but are no longer served.
        src = BACKEND.read_text(encoding="utf-8")
        self.assertNotIn("p=='/tuo.html'", src)
        self.assertNotIn("p=='/app.js'", src)
        self.assertNotIn("'static/index.html'", src)
        self.assertNotIn("'static/app.js'", src)
        self.assertTrue((STATIC / "index.html").is_file())
        self.assertTrue((STATIC / "app.js").is_file())

    def test_clients_send_request_header(self):
        app = (STATIC / "app.js").read_text(encoding="utf-8")
        api = next(line for line in app.splitlines() if line.startswith("async function api("))
        # 투오's api() adds the header to what the caller passes (custom firmware upload sends X-Filename).
        self.assertIn("...o.headers,'X-MTTL-Request':'1'", api)
        core = (STATIC / "dashboard-core.mjs").read_text(encoding="utf-8")
        self.assertIn('"X-MTTL-Request": "1"', core)
        # Every request goes through apiGet, apiSend and apiSendRaw, the only callers of fetch.
        self.assertEqual(len(re.findall(r"\bfetch\(", core)), 3)
        for name, sender in (
            ("dashboard.mjs", "apiSend("),
            ("logview.mjs", "apiSend("),
            ("settings-core.mjs", "apiSend("),
            ("settings-core.mjs", "apiSendRaw("),
            ("settings.mjs", None),
            ("firmware-core.mjs", None),
        ):
            with self.subTest(file=name, sender=sender):
                src = (STATIC / name).read_text(encoding="utf-8")
                if sender:
                    self.assertIn(sender, src)
                self.assertNotIn("fetch(", src)
                self.assertNotIn("XMLHttpRequest", src)
                self.assertNotIn("sendBeacon", src)

    def test_frame_options_sameorigin(self):
        src = BACKEND.read_text(encoding="utf-8")
        self.assertIn("send_header('X-Frame-Options','SAMEORIGIN')", src)
        self.assertNotIn("'DENY'", src)


if __name__ == "__main__":
    unittest.main()
