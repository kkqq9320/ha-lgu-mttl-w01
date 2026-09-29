import contextlib
import importlib.util
import io
import json
import socket
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("run", ROOT / "mttl_w01" / "run.py")
r = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = r
_spec.loader.exec_module(r)

MQTT = {"host": "core-mosquitto", "port": 1883, "username": "addons", "password": "pw", "ssl": False}
NET = {"interfaces": [
    {"interface": "wlan0", "primary": False, "connected": True, "ipv4": {"address": ["192.0.2.50/24"]}},
    {"interface": "eth0", "primary": True, "connected": True, "ipv4": {"address": ["192.0.2.31/24"]}}]}
SECRET = "s3cret-mqtt-password"
# 응답 본문에 비밀번호가 들어 있지만 해석할 수 없는 응답: 잘못된 UTF-8, JSON이 아닌 본문
RAW_BODIES = {
    "/badbytes": b'{"result":"ok","data":{"host":"core-mosquitto","password":"' + SECRET.encode() + b'\xff"}}',
    "/notjson": b"not json " + SECRET.encode(),
}


def closed_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class FakeSupervisor(BaseHTTPRequestHandler):
    """경로별로 Supervisor 응답을 흉내 낸다."""

    authorizations = []

    def do_GET(self):
        FakeSupervisor.authorizations.append(self.headers.get("Authorization"))
        if self.path == "/truncated":
            self.wfile.write(b'HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n{"result"')
            self.close_connection = True
            return
        if self.path == "/badstatus":
            self.wfile.write(b"garbage\r\n\r\n")
            self.close_connection = True
            return
        if self.path in RAW_BODIES:
            self.send_raw(200, RAW_BODIES[self.path])
            return
        if self.path == "/services/mqtt":
            status, payload = 200, {"result": "ok", "data": MQTT}
        elif self.path == "/services/mqtt-secret":
            status, payload = 200, {"result": "ok", "data": {**MQTT, "password": SECRET}}
        elif self.path == "/services/mqtt-nohost":
            status, payload = 200, {"result": "ok", "data": {"port": 1883, "password": SECRET}}
        elif self.path == "/network/info":
            status, payload = 200, {"result": "ok", "data": NET}
        elif self.path == "/error":
            status, payload = 200, {"result": "error", "message": "x"}
        elif self.path == "/notdict":
            status, payload = 200, {"result": "ok", "data": [SECRET]}
        else:
            status, payload = 400, {"result": "error", "message": "bad request"}
        self.send_raw(status, json.dumps(payload).encode())

    def send_raw(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


class RunTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeSupervisor)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        FakeSupervisor.authorizations.clear()

    # build_env

    def test_build_env_sets_backend_vars(self):
        env = r.build_env("192.0.2.31", {"log_level": "INFO"}, MQTT, {"PATH": "/usr/bin"})
        self.assertEqual(env["OTA_HOST_IP"], "192.0.2.31")
        self.assertEqual(env["MTTL_PUBLIC_WEB_URL"], "http://192.0.2.31:18282")
        self.assertEqual(env["LOG_LEVEL"], "INFO")
        self.assertEqual((env["HA_MQTT_HOST"], env["HA_MQTT_PORT"]), ("core-mosquitto", "1883"))
        self.assertEqual((env["HA_MQTT_USERNAME"], env["HA_MQTT_PASSWORD"], env["HA_MQTT_TLS"]),
                         ("addons", "pw", "false"))
        self.assertEqual(env["PATH"], "/usr/bin")

    def test_build_env_ssl_true(self):
        self.assertEqual(r.build_env("192.0.2.31", {}, {**MQTT, "ssl": True}, {})["HA_MQTT_TLS"], "true")

    def test_build_env_default_log_level(self):
        self.assertEqual(r.build_env("192.0.2.31", {}, None, {})["LOG_LEVEL"], "INFO")

    def test_build_env_without_mqtt(self):
        env = r.build_env("192.0.2.31", {}, None, {})
        self.assertFalse([k for k in env if k.startswith("HA_MQTT_")])

    # Supervisor 조회

    def test_fetch_mqtt_service_parses_data(self):
        self.assertEqual(r.fetch_mqtt_service("tok", url=f"{self.base}/services/mqtt"), MQTT)
        self.assertEqual(FakeSupervisor.authorizations, ["Bearer tok"])

    def test_fetch_mqtt_service_failures_return_none(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assertIsNone(r.fetch_mqtt_service(None, url=f"{self.base}/services/mqtt"))
            self.assertIsNone(r.fetch_mqtt_service(
                "tok", url=f"http://127.0.0.1:{closed_port()}/services/mqtt", timeout=1))
            self.assertIsNone(r.fetch_mqtt_service("tok", url=f"{self.base}/error"))
            self.assertIsNone(r.fetch_mqtt_service("tok", url=f"{self.base}/status400"))
            self.assertIsNone(r.fetch_mqtt_service("tok", url=f"{self.base}/services/mqtt-nohost"))
        self.assertIn("[run]", err.getvalue())

    def test_fetch_mqtt_service_broken_http_returns_none(self):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertIsNone(r.fetch_mqtt_service("tok", url=f"{self.base}/truncated"))
            self.assertIsNone(r.fetch_mqtt_service("tok", url=f"{self.base}/badstatus"))

    def test_supervisor_get_returns_data(self):
        self.assertEqual(r.supervisor_get("tok", f"{self.base}/network/info"), NET)
        self.assertEqual(FakeSupervisor.authorizations, ["Bearer tok"])

    def test_supervisor_get_rejects_non_dict_data(self):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertIsNone(r.supervisor_get("tok", f"{self.base}/notdict"))

    def test_supervisor_get_never_logs_response_body(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assertIsNotNone(r.supervisor_get("tok", f"{self.base}/services/mqtt-secret"))
            self.assertIsNone(r.supervisor_get("tok", f"{self.base}/notdict"))
            self.assertIsNone(r.fetch_mqtt_service("tok", url=f"{self.base}/services/mqtt-nohost"))
        self.assertNotIn(SECRET, err.getvalue())
        self.assertIn("[run]", err.getvalue())

    def test_supervisor_get_undecodable_body_never_logged(self):
        for path in RAW_BODIES:
            err = io.StringIO()
            with self.subTest(path=path), contextlib.redirect_stderr(err):
                self.assertIsNone(r.supervisor_get("tok", f"{self.base}{path}"))
                self.assertIsNone(r.fetch_mqtt_service("tok", url=f"{self.base}{path}"))
            self.assertNotIn(SECRET, err.getvalue())
            self.assertIn("[run]", err.getvalue())
        self.assertEqual(FakeSupervisor.authorizations, ["Bearer tok"] * (2 * len(RAW_BODIES)))

    def test_pick_primary_ipv4(self):
        self.assertEqual(r.pick_primary_ipv4(NET), "192.0.2.31")

    def test_pick_primary_ipv4_none_cases(self):
        for net in ({"interfaces": []},
                    {"interfaces": [{"primary": True, "connected": False, "ipv4": {"address": ["192.0.2.31/24"]}}]},
                    {"interfaces": [{"primary": False, "connected": True, "ipv4": {"address": ["192.0.2.31/24"]}}]},
                    {"interfaces": [{"primary": True, "connected": True, "ipv4": {"address": []}}]},
                    {"interfaces": [{"primary": True, "connected": True}]}):
            with self.subTest(net=net):
                self.assertIsNone(r.pick_primary_ipv4(net))

    def test_pick_primary_ipv4_tolerates_malformed_network(self):
        for net in ({}, {"interfaces": None}, {"interfaces": ["eth0"]},
                    {"interfaces": [{"primary": True, "connected": True, "ipv4": None}]},
                    {"interfaces": [{"primary": True, "connected": True, "ipv4": {"address": "192.0.2.31/24"}}]},
                    {"interfaces": [{"primary": True, "connected": True, "ipv4": {"address": [None]}}]}):
            with self.subTest(net=net):
                self.assertIsNone(r.pick_primary_ipv4(net))

    def test_pick_primary_ipv4_without_prefix_length(self):
        net = {"interfaces": [{"primary": True, "connected": True, "ipv4": {"address": ["192.0.2.31"]}}]}
        self.assertEqual(r.pick_primary_ipv4(net), "192.0.2.31")

    def test_fetch_host_ip_over_http(self):
        self.assertEqual(r.fetch_host_ip("tok", url=f"{self.base}/network/info"), "192.0.2.31")
        self.assertEqual(FakeSupervisor.authorizations, ["Bearer tok"])

    def test_fetch_host_ip_failures_return_none(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assertIsNone(r.fetch_host_ip(None, url=f"{self.base}/network/info"))
            self.assertIsNone(r.fetch_host_ip(
                "tok", url=f"http://127.0.0.1:{closed_port()}/network/info", timeout=1))
            self.assertIsNone(r.fetch_host_ip("tok", url=f"{self.base}/error"))
        self.assertIn("[run]", err.getvalue())

    def test_fetch_host_ip_without_primary_interface_returns_none(self):
        with mock.patch.object(r, "supervisor_get", return_value={"interfaces": []}), \
                contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertIsNone(r.fetch_host_ip("tok"))
        self.assertIn("[run]", err.getvalue())

    # host_ip 결정

    def test_resolve_host_ip_option_wins(self):
        detect = mock.Mock(return_value="192.0.2.99")
        self.assertEqual(r.resolve_host_ip({"host_ip": "192.0.2.10"}, detect), "192.0.2.10")
        detect.assert_not_called()

    def test_resolve_host_ip_detects_when_missing(self):
        for opts in ({}, {"host_ip": ""}, {"host_ip": None}):
            with self.subTest(opts=opts):
                self.assertEqual(r.resolve_host_ip(opts, lambda: "192.0.2.31"), "192.0.2.31")

    def test_resolve_host_ip_rejects_bad_option(self):
        for bad in ("192.0.2", "homeassistant.local", "192.0.02.1", " 192.0.2.10", 5):
            detect = mock.Mock(return_value="192.0.2.31")
            with self.subTest(bad=bad), self.assertRaises(ValueError) as cm:
                r.resolve_host_ip({"host_ip": bad}, detect)
            self.assertIn("host_ip", str(cm.exception))
            detect.assert_not_called()

    def test_resolve_host_ip_detect_failed(self):
        with self.assertRaises(ValueError) as cm:
            r.resolve_host_ip({}, lambda: None)
        self.assertIn("host_ip", str(cm.exception))

    def test_resolve_host_ip_rejects_bad_detected_value(self):
        with self.assertRaises(ValueError) as cm:
            r.resolve_host_ip({}, lambda: "not-an-ip")
        self.assertIn("host_ip", str(cm.exception))

    # main

    def test_main_exits_when_host_unresolved(self):
        err = io.StringIO()
        with mock.patch.object(r, "load_options", return_value={}), \
                mock.patch.object(r, "fetch_host_ip", return_value=None), \
                mock.patch.object(r, "fetch_mqtt_service") as mqtt_mock, \
                mock.patch.object(r.os, "execve") as execve_mock, \
                contextlib.redirect_stderr(err), \
                self.assertRaises(SystemExit) as cm:
            r.main()
        self.assertEqual(cm.exception.code, 1)
        mqtt_mock.assert_not_called()
        execve_mock.assert_not_called()
        self.assertIn("host_ip", err.getvalue())

    def test_main_exits_on_bad_option(self):
        err = io.StringIO()
        with mock.patch.object(r, "load_options", return_value={"host_ip": "homeassistant.local"}), \
                mock.patch.object(r, "fetch_host_ip") as host_mock, \
                mock.patch.object(r, "fetch_mqtt_service") as mqtt_mock, \
                mock.patch.object(r.os, "execve") as execve_mock, \
                contextlib.redirect_stderr(err), \
                self.assertRaises(SystemExit) as cm:
            r.main()
        self.assertEqual(cm.exception.code, 1)
        host_mock.assert_not_called()
        mqtt_mock.assert_not_called()
        execve_mock.assert_not_called()
        self.assertIn("host_ip", err.getvalue())

    def test_main_exits_when_options_unreadable(self):
        err = io.StringIO()
        with mock.patch.object(r, "load_options", side_effect=FileNotFoundError("options.json")), \
                mock.patch.object(r.os, "execve") as execve_mock, \
                contextlib.redirect_stderr(err), \
                self.assertRaises(SystemExit) as cm:
            r.main()
        self.assertEqual(cm.exception.code, 1)
        execve_mock.assert_not_called()
        self.assertIn("[run]", err.getvalue())

    def test_main_execs_backend_with_option_ip(self):
        err = io.StringIO()
        with mock.patch.object(r, "load_options", return_value={"host_ip": "192.0.2.10"}), \
                mock.patch.object(r, "fetch_host_ip") as host_mock, \
                mock.patch.object(r, "fetch_mqtt_service", return_value={**MQTT, "password": SECRET}), \
                mock.patch.object(r.os, "execve") as execve_mock, \
                contextlib.redirect_stderr(err):
            r.main()
        host_mock.assert_not_called()
        self.assertEqual(execve_mock.call_args.args[1][1:], ["/app/backend.py", "--data", "/data"])
        env = execve_mock.call_args.args[2]
        self.assertEqual(env["OTA_HOST_IP"], "192.0.2.10")
        self.assertEqual(env["HA_MQTT_HOST"], "core-mosquitto")
        self.assertIn("192.0.2.10", err.getvalue())
        self.assertIn("option", err.getvalue())
        self.assertNotIn(SECRET, err.getvalue())
        self.assertEqual(execve_mock.call_args.args[2]["HA_MQTT_PASSWORD"], SECRET)

    def test_main_execs_backend_with_detected_ip(self):
        err = io.StringIO()
        with mock.patch.object(r, "load_options", return_value={}), \
                mock.patch.object(r, "fetch_host_ip", return_value="192.0.2.31"), \
                mock.patch.object(r, "fetch_mqtt_service", return_value=None), \
                mock.patch.object(r.os, "execve") as execve_mock, \
                contextlib.redirect_stderr(err):
            r.main()
        env = execve_mock.call_args.args[2]
        self.assertEqual(env["OTA_HOST_IP"], "192.0.2.31")
        self.assertEqual(env["MTTL_PUBLIC_WEB_URL"], "http://192.0.2.31:18282")
        self.assertIn("192.0.2.31", err.getvalue())
        self.assertIn("auto-detect", err.getvalue())


if __name__ == "__main__":
    unittest.main()
