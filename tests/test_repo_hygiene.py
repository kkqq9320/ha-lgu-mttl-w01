import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# 사설 대역 10/8의 주소. 시험 자료와 문서 예시는 문서용 주소(192.0.2.0/24 등)만 쓴다.
PRIVATE_10_ADDRESS = re.compile(rb"(?<![0-9.])10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(?![0-9])")


def tracked_files():
    """git ls-files가 알려 주는 파일 중 작업 폴더에 남아 있는 것."""
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    ).stdout
    paths = [ROOT / name.decode("utf-8") for name in out.split(b"\0") if name]
    return [p for p in paths if p.is_file()]


class RepoHygieneTest(unittest.TestCase):
    def test_no_firmware_files(self):
        offenders = [p for p in tracked_files() if p.suffix.lower() == ".fwr"]
        self.assertEqual(offenders, [])

    def test_no_private_10_addresses(self):
        offenders = [p for p in tracked_files() if PRIVATE_10_ADDRESS.search(p.read_bytes())]
        self.assertEqual(offenders, [])


if __name__ == "__main__":
    unittest.main()
