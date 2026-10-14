"""릴리스 태그와 `mttl_w01/config.yaml`을 맞춰 보고, 빌드에 쓸 값을 GitHub Actions 출력으로 낸다.

    python tools/release_info.py v26.10.0 --github-output "$GITHUB_OUTPUT"

태그는 `v<판>`이고, 판은 날짜 판 `<YY>.<M>.<N>`이며 `config.yaml`의 `version`과 같아야 한다.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

VERSION_RE = r"^\d{2}\.([1-9]|1[0-2])\.(0|[1-9]\d*)$"
OUTPUT_KEYS = ("version", "name", "description", "url")
DEFAULT_CONFIG = Path(__file__).resolve().parents[1] / "mttl_w01" / "config.yaml"


def _scalar(raw: str) -> str:
    raw = raw.strip()
    if raw[:1] in ("'", '"'):
        quote = raw[0]
        end = raw.find(quote, 1)
        rest = raw[end + 1:] if end > 0 else ""
        if end < 0 or (rest.strip() and not rest.strip().startswith("#")) or (quote == '"' and "\\" in raw[:end]):
            raise ValueError(f"cannot read the quoted value {raw!r}")
        return raw[1:end]
    return raw.split(" #", 1)[0].strip()


def config_values(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in text.splitlines():
        if not line.strip() or line[0] in " \t#":
            continue
        key, sep, raw = line.partition(":")
        if not sep:
            raise ValueError(f"cannot read the config line {line!r}")
        value = _scalar(raw)
        if not value:
            continue  # a mapping or a list follows on the next lines
        if key in values:
            raise ValueError(f"config.yaml sets {key!r} twice")
        values[key] = value
    return values


def release_info(tag: str, config_text: str) -> dict[str, str]:
    if not tag.startswith("v"):
        raise ValueError(f"release tag {tag!r} must be v<version>, for example v26.10.0")
    version = tag[1:]
    if not re.fullmatch(VERSION_RE, version, re.ASCII):
        raise ValueError(f"release tag {tag!r} is not a calendar version <YY>.<M>.<N>")
    values = config_values(config_text)
    if values.get("version") != version:
        raise ValueError(f"release tag {tag!r} does not match config.yaml version {values.get('version')!r}")
    missing = [key for key in OUTPUT_KEYS if not values.get(key)]
    if missing:
        raise ValueError(f"config.yaml has no {', '.join(missing)}")
    return {key: values[key] for key in OUTPUT_KEYS}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check a release tag against config.yaml and print build values.")
    parser.add_argument("tag", help="release tag, for example v26.10.0")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="path to config.yaml")
    parser.add_argument("--github-output", type=Path, help="append key=value lines to this file")
    args = parser.parse_args(argv)
    try:
        info = release_info(args.tag, args.config.read_bytes().decode("utf-8"))
    except (OSError, UnicodeDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    lines = "".join(f"{key}={value}\n" for key, value in info.items())
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8", newline="\n") as out:
            out.write(lines)
    else:
        sys.stdout.write(lines)
    return 0


if __name__ == "__main__":
    sys.exit(main())
