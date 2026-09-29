"""설정 모드 MTTL-W01 멀티탭의 기기 정보(LGAPMODE 명령 103)를 읽는다. 쓰기 명령은 보내지 않는다."""

from __future__ import annotations

import argparse
import socket
import struct
import sys
from dataclasses import dataclass

MAGIC = b"LGAPMODE0010"
DEFAULT_HOST = "192.168.1.1"
DEFAULT_PORT = 30300
DEVICE_INFO = 103
HEADER_SIZE = 20
MIN_BODY = 68
MAX_BODY = 512


@dataclass(frozen=True)
class DeviceInfo:
    mac: str
    serial: str
    firmware: str
    model: str
    response_code: int
    result: int


class ResponseError(Exception):
    pass


def build_request(code: int) -> bytes:
    return MAGIC + struct.pack("<II", code, 0)


def _parse_header(header: bytes) -> tuple[int, int]:
    if len(header) != HEADER_SIZE or header[:12] != MAGIC:
        raise ResponseError(f"응답 머리가 LGAPMODE0010이 아닙니다: {header[:12]!r}")
    code, size = struct.unpack("<II", header[12:])
    if not MIN_BODY <= size <= MAX_BODY:
        raise ResponseError(f"본문 길이가 범위({MIN_BODY}~{MAX_BODY}) 밖입니다: {size} (응답 코드 {code})")
    return code, size


def _text(raw: bytes) -> str:
    # ASCII가 아닌 바이트는 \xNN으로 남긴다. 원래 값을 보이고, cp949 파이프에서도 출력할 수 있다.
    return raw.split(b"\0", 1)[0].decode("ascii", errors="backslashreplace").strip()


def parse_response(header: bytes, body: bytes) -> DeviceInfo:
    code, size = _parse_header(header)
    if len(body) != size:
        raise ResponseError(f"본문 길이가 머리와 다릅니다: 머리 {size}, 실제 {len(body)}")
    return DeviceInfo(
        mac=_text(body[0:12]),
        serial=_text(body[12:32]),
        firmware=_text(body[32:48]),
        model=_text(body[48:64]),
        response_code=code,
        result=struct.unpack("<I", body[-4:])[0],
    )


def _recv_exact(sock: socket.socket, size: int) -> bytes:
    data = b""
    while len(data) < size:
        chunk = sock.recv(size - len(data))
        if not chunk:
            raise ResponseError("응답이 중간에 끊겼습니다")
        data += chunk
    return data


def read_device_info(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, timeout: float = 6.0) -> DeviceInfo:
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(build_request(DEVICE_INFO))
        header = _recv_exact(sock, HEADER_SIZE)
        _, size = _parse_header(header)
        return parse_response(header, _recv_exact(sock, size))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="설정 모드 MTTL-W01 멀티탭의 기기 정보를 읽는다")
    ap.add_argument("--host", default=DEFAULT_HOST)
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--timeout", type=float, default=6.0)
    args = ap.parse_args(argv)
    try:
        info = read_device_info(args.host, args.port, args.timeout)
    except ResponseError as e:
        print(f"멀티탭 응답이 올바르지 않습니다: {e}", file=sys.stderr)
        return 1
    except OSError as e:
        print(f"{args.host}:{args.port}에 연결하지 못했습니다. PC Wi-Fi가 멀티탭 설정망(TONLY_TAP_*)에 연결됐는지, "
              f"멀티탭이 설정 모드(주황 LED 빠른 점멸)인지 확인하세요. ({e})", file=sys.stderr)
        return 2
    print(f"MAC: {info.mac}")
    print(f"시리얼: {info.serial}")
    print(f"펌웨어: {info.firmware}")
    print(f"모델: {info.model}")
    print(f"응답 코드: {info.response_code}")
    print(f"결과: {info.result}")
    return 0 if info.result == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
