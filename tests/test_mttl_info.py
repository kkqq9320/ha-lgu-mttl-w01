import contextlib
import importlib.util
import io
import os
import socket
import struct
import subprocess
import sys
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("mttl_info", ROOT / "tools" / "mttl_info.py")
m = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = m
_spec.loader.exec_module(m)


def body(mac=b"0123456789AB", serial=b"SERIAL123", fw=b"1.0.66", model=b"MTTL-W01", result=0):
    return (mac + serial.ljust(20, b"\0") + fw.ljust(16, b"\0")
            + model.ljust(16, b"\0") + b"\0\0" + struct.pack("<I", result))


def header(code=20301, size=70, magic=b"LGAPMODE0010"):
    return magic + struct.pack("<II", code, size)


def closed_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class FakeDevice:
    """설정 모드 멀티탭 흉내: 요청 하나를 받고 정해진 조각들을 보낸 뒤 닫는다."""

    def __init__(self, chunks):
        self.chunks = chunks
        self.received = b""
        self.sock = socket.socket()
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen(1)
        self.port = self.sock.getsockname()[1]
        self.thread = threading.Thread(target=self._serve, daemon=True)
        self.thread.start()

    def _serve(self):
        conn, _ = self.sock.accept()
        with conn:
            conn.settimeout(2)
            while len(self.received) < 20:
                data = conn.recv(20 - len(self.received))
                if not data:
                    break
                self.received += data
            for chunk in self.chunks:
                conn.sendall(chunk)

    def close(self):
        self.thread.join(timeout=3)
        self.sock.close()


class MttlInfoTest(unittest.TestCase):
    def serve(self, chunks):
        device = FakeDevice(chunks)
        self.addCleanup(device.close)
        return device

    def test_build_request_103(self):
        self.assertEqual(m.build_request(103), b"LGAPMODE0010" + struct.pack("<II", 103, 0))

    def test_parse_valid_response(self):
        self.assertEqual(
            m.parse_response(header(), body()),
            m.DeviceInfo(mac="0123456789AB", serial="SERIAL123", firmware="1.0.66",
                         model="MTTL-W01", response_code=20301, result=0))

    def test_parse_nonzero_result(self):
        self.assertEqual(m.parse_response(header(), body(result=5)).result, 5)

    def test_parse_non_ascii_and_nul(self):
        info = m.parse_response(header(), body(serial=b"\xb0\xa1ABC"))
        self.assertEqual(info.serial, "\\xb0\\xa1ABC")

    def test_parse_rejects_bad_magic(self):
        with self.assertRaises(m.ResponseError):
            m.parse_response(header(magic=b"XXXXXXXXXXXX"), body())

    def test_parse_rejects_size_out_of_range(self):
        with self.assertRaises(m.ResponseError):
            m.parse_response(header(size=10), b"\0" * 10)
        with self.assertRaises(m.ResponseError):
            m.parse_response(header(size=600), b"\0" * 600)

    def test_read_device_info_over_socket(self):
        h = header()
        device = self.serve([h[:12], h[12:], body()])
        info = m.read_device_info("127.0.0.1", device.port, timeout=2)
        device.close()
        self.assertEqual(device.received, m.build_request(103))
        self.assertEqual(info.model, "MTTL-W01")

    def test_read_device_info_truncated(self):
        device = self.serve([header(), body()[:30]])
        with self.assertRaises(m.ResponseError):
            m.read_device_info("127.0.0.1", device.port, timeout=2)

    def test_main_connection_error(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            code = m.main(["--host", "127.0.0.1", "--port", str(closed_port()), "--timeout", "1"])
        self.assertEqual(code, 2)
        self.assertIn("TONLY_TAP", err.getvalue())

    def test_main_prints_fields(self):
        h = header()
        device = self.serve([h[:12], h[12:], body()])
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = m.main(["--host", "127.0.0.1", "--port", str(device.port)])
        self.assertEqual(code, 0)
        self.assertIn("펌웨어: 1.0.66", out.getvalue())

    def test_main_non_ascii_field_on_cp949_pipe(self):
        # 이 PC에서 파이프·파일로 출력하면 표준 출력이 cp949다
        h = header()
        device = self.serve([h[:12], h[12:], body(serial=b"\xb0\xa1ABC")])
        proc = subprocess.run(
            [sys.executable, str(ROOT / "tools" / "mttl_info.py"), "--host", "127.0.0.1", "--port", str(device.port)],
            capture_output=True, env={**os.environ, "PYTHONIOENCODING": "cp949"}, timeout=10)
        self.assertEqual(proc.returncode, 0, proc.stderr.decode("cp949", "replace"))
        self.assertIn(b"\\xb0\\xa1ABC", proc.stdout)
        self.assertIn("모델: MTTL-W01".encode("cp949"), proc.stdout)


if __name__ == "__main__":
    unittest.main()
