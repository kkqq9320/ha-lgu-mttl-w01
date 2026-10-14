"""로컬 빌드 시험용 앱 폴더를 tar로 묶어 표준 출력으로 낸다.

    python tools/pack_local_app.py | ssh <HA SSH 호스트> 'sudo tar -C /addons --no-same-owner -xf -'

`config.yaml`의 `image:` 줄을 주석으로 바꿔 HA가 이미지를 받지 않고 빌드하게 하고,
`--keep-mqtt`가 없으면 `services:` 블록도 주석으로 바꿔 MQTT 없이 돌게 한다.
"""

from __future__ import annotations

import argparse
import io
import sys
import tarfile
from pathlib import Path
from typing import BinaryIO

APP = "mttl_w01"
# Build copies of these root files may sit in the app folder (git-ignored); the root files win.
ROOT_FILES = ("NOTICE.md", "LICENSE")


def local_config(text: str, keep_mqtt: bool = False) -> str:
    lines = text.splitlines(keepends=True)
    images = [i for i, line in enumerate(lines) if line.startswith("image:")]
    if len(images) != 1:
        raise ValueError(f"config.yaml must have exactly one top-level 'image:' line, found {len(images)}")
    commented = set(images)
    if not keep_mqtt:
        services = [i for i, line in enumerate(lines) if line.startswith("services:")]
        if len(services) != 1:
            raise ValueError(f"config.yaml must have exactly one top-level 'services:' line, found {len(services)}")
        commented.add(services[0])
        for i in range(services[0] + 1, len(lines)):
            line = lines[i]
            if line.startswith((" ", "\t", "-")):
                commented.add(i)
            elif line.strip() and not line.startswith("#"):
                break
    return "".join("#" + line if i in commented else line for i, line in enumerate(lines))


def app_members(repo: Path) -> list[tuple[str, Path]]:
    app = repo / APP
    members = []
    for path in app.rglob("*"):
        rel = path.relative_to(app)
        if not path.is_file() or "__pycache__" in rel.parts or path.suffix == ".pyc":
            continue
        if rel.as_posix() in ROOT_FILES:
            continue
        members.append((f"{APP}/{rel.as_posix()}", path))
    members += [(f"{APP}/{name}", repo / name) for name in ROOT_FILES]
    return sorted(members)


def _add(tar: tarfile.TarFile, name: str, data: bytes, mtime: float) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = 0o644
    info.mtime = int(mtime)
    tar.addfile(info, io.BytesIO(data))


def write_tar(repo: Path, out: BinaryIO, keep_mqtt: bool = False) -> None:
    config_path = repo / APP / "config.yaml"
    # Check the config before streaming anything: a partial tar would still be extracted on the HA host.
    config = local_config(config_path.read_bytes().decode("utf-8"), keep_mqtt=keep_mqtt).encode("utf-8")
    members = app_members(repo)
    with tarfile.open(fileobj=out, mode="w|", format=tarfile.PAX_FORMAT) as tar:
        for name, path in members:
            data = config if path == config_path else path.read_bytes()
            _add(tar, name, data, path.stat().st_mtime)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Pack the app folder for a local build test in Home Assistant.")
    parser.add_argument("--keep-mqtt", action="store_true",
                        help="keep the MQTT service (only when the local app is the one in production)")
    args = parser.parse_args(argv)
    repo = Path(__file__).resolve().parents[1]
    try:
        write_tar(repo, sys.stdout.buffer, keep_mqtt=args.keep_mqtt)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
