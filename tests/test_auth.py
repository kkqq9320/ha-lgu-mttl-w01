"""The app has no admin login; state-changing requests need the X-MTTL-Request header instead.

backend.py is imported without starting it. Its modules import paho-mqtt and cryptography, which
the tests do not install, so stand-ins take their place in sys.modules during the import.
"""
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "mttl_w01" / "backend"


def _stand_ins():
    fernet = types.ModuleType("cryptography.fernet")
    fernet.Fernet = type("Fernet", (), {})
    fernet.InvalidToken = type("InvalidToken", (Exception,), {})
    cryptography = types.ModuleType("cryptography")
    cryptography.fernet = fernet
    client = types.ModuleType("paho.mqtt.client")
    mqtt = types.ModuleType("paho.mqtt")
    mqtt.client = client
    paho = types.ModuleType("paho")
    paho.mqtt = mqtt
    return {
        "cryptography": cryptography, "cryptography.fernet": fernet,
        "paho": paho, "paho.mqtt": mqtt, "paho.mqtt.client": client,
    }


def _import_backend():
    stand_ins = _stand_ins()
    saved = {name: sys.modules.get(name) for name in stand_ins}
    sys.modules.update(stand_ins)
    sys.path.insert(0, str(BACKEND_DIR))
    try:
        import backend
    finally:
        # Only the stand-ins leave sys.modules again, so they cannot reach other tests.
        sys.path.remove(str(BACKEND_DIR))
        for name, module in saved.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module
    return backend


backend = _import_backend()


class FakeStore:
    """The settings AuthManager reads and writes when it starts."""

    def __init__(self):
        self.settings = {}

    def setting_get(self, key):
        return self.settings.get(key)

    def setting_set_many(self, values):
        self.settings.update(values)

    def auth_session_prune(self, t):
        pass


class FakeSocket:
    """One HTTP exchange: `request` is what the client sent, `sent` collects the answer."""

    def __init__(self, request):
        self.request = request
        self.sent = bytearray()

    def makefile(self, mode, bufsize=-1):
        return io.BytesIO(self.request)

    def sendall(self, data):
        self.sent += data


class AuthTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.auth = backend.AuthManager(FakeStore())
        # A subclass keeps the class attributes of backend.Web as they were.
        cls.Web = type("TestWeb", (backend.Web,), {"auth": cls.auth})

    def exchange(self, method, path, headers=(), body=b""):
        lines = [f"{method} {path} HTTP/1.1", "Host: 192.0.2.10:18282", f"Content-Length: {len(body)}", *headers]
        sock = FakeSocket(("\r\n".join(lines) + "\r\n\r\n").encode("ascii") + body)
        self.Web(sock, ("192.0.2.50", 50000), None)
        head, _, payload = bytes(sock.sent).partition(b"\r\n\r\n")
        status = int(head.split(b" ", 2)[1])
        try:
            answer = json.loads(payload or b"null")
        except ValueError:
            answer = None
        return status, answer

    def test_auth_always_valid(self):
        for token in (None, "", "x", "not-a-session"):
            with self.subTest(token=token):
                self.assertIs(self.auth.valid(token), True)
                self.assertEqual(self.auth.status(token), {"authenticated": True, "must_change_password": False})
        self.assertEqual(self.auth.status(), {"authenticated": True, "must_change_password": False})
        # GET needs no header and no session cookie.
        self.assertEqual(self.exchange("GET", "/api/auth/status"), (200, {"authenticated": True, "must_change_password": False}))

    def test_state_changing_requests_need_header(self):
        missing = {"error": "missing X-MTTL-Request header"}
        body = b"{}"
        for method, path in (
            ("POST", "/api/logs/clear"),
            ("POST", "/api/auth/login"),
            ("POST", "/api/devices/0a1b2c3d4e5f/outlets/0/power"),
            ("PUT", "/api/config"),
            ("PUT", "/api/devices/0a1b2c3d4e5f"),
        ):
            for headers in ((), ("X-MTTL-Request: 0",), ("X-MTTL-Request: yes",)):
                with self.subTest(method=method, path=path, headers=headers):
                    self.assertEqual(self.exchange(method, path, headers, body), (403, missing))

        with mock.patch.object(backend.UI_LOG, "clear") as clear:
            self.assertEqual(self.exchange("POST", "/api/logs/clear", ("X-MTTL-Request: 1",), body), (200, {"ok": True}))
            clear.assert_called_once()
            # Header names are case-insensitive.
            self.assertEqual(self.exchange("POST", "/api/logs/clear", ("x-mttl-request: 1",), body)[0], 200)
            # A refused request does nothing.
            self.exchange("POST", "/api/logs/clear", (), body)
            self.assertEqual(clear.call_count, 2)
        # With the header the request reaches the handler: {} is not a valid config change (400, not 403).
        status, answer = self.exchange("PUT", "/api/config", ("X-MTTL-Request: 1",), body)
        self.assertEqual((status, answer), (400, {"error": "no supported config field"}))

    def test_no_cors_preflight(self):
        # A page on another site must send OPTIONS before a request with this header; nothing allows it.
        self.assertFalse(hasattr(backend.Web, "do_OPTIONS"))
        status, _ = self.exchange("OPTIONS", "/api/logs/clear", ("Origin: http://192.0.2.99", "Access-Control-Request-Method: POST"))
        self.assertEqual(status, 501)


if __name__ == "__main__":
    unittest.main()
