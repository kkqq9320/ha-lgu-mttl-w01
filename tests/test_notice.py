import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTICE = ROOT / "NOTICE.md"
UNMODIFIED = "## Unmodified Tuo files / 그대로 쓴 투오 파일"
MODIFIED = "## Modified Tuo files / 고쳐 쓴 투오 파일"
AF950833 = "## af950833"
MDI = "## Material Design Icons"
ITEM = re.compile(r"^- `([^`]+)`(.*)$")


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True)


def tuo_ref():
    """The branch that holds Tuo's original files: "tuo", else "origin/tuo", else None."""
    for ref in ("tuo", "origin/tuo"):
        if git("rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}").returncode == 0:
            return ref
    return None


def tuo_files(ref):
    out = git("ls-tree", "-r", "-z", "--name-only", ref)
    out.check_returncode()
    names = [name.decode("utf-8") for name in out.stdout.split(b"\0") if name]
    return [name for name in names if name != ".gitattributes"]


def git_show(ref, path):
    out = git("show", f"{ref}:{path}")
    out.check_returncode()
    return out.stdout


def norm(data):
    return data.replace(b"\r\n", b"\n")


def section(text, heading):
    """Lines under the exact `heading` line, up to the next `#` or `##` heading."""
    lines = text.splitlines()
    start = lines.index(heading) + 1
    end = next((i for i in range(start, len(lines)) if re.match(r"^##? ", lines[i])), len(lines))
    return lines[start:end]


class NoticeTest(unittest.TestCase):
    def notice(self):
        self.assertTrue(NOTICE.is_file(), "NOTICE.md is missing")
        return NOTICE.read_text(encoding="utf-8")

    def items(self, heading):
        """(path, rest of line) for each `` - `path` `` line under `heading`."""
        text = self.notice()
        self.assertEqual(text.splitlines().count(heading), 1, heading)
        found = [ITEM.match(line) for line in section(text, heading)]
        return [(m.group(1), m.group(2)) for m in found if m]

    def ref(self):
        ref = tuo_ref()
        if ref is None:
            self.skipTest("the tuo branch is not available")
        return ref

    def test_notice_lists_every_tuo_file(self):
        unmodified = [path for path, _ in self.items(UNMODIFIED)]
        modified = [path for path, _ in self.items(MODIFIED)]
        self.assertEqual(len(unmodified), len(set(unmodified)), "duplicate in the unmodified list")
        self.assertEqual(len(modified), len(set(modified)), "duplicate in the modified list")
        self.assertEqual(set(unmodified) & set(modified), set())
        self.assertEqual(set(unmodified) | set(modified), set(tuo_files(self.ref())))

    def test_unmodified_files_match_tuo(self):
        ref = self.ref()
        for path, _ in self.items(UNMODIFIED):
            with self.subTest(path=path):
                self.assertEqual(norm((ROOT / path).read_bytes()), norm(git_show(ref, path)))

    def test_modified_files_differ_from_tuo(self):
        ref = self.ref()
        items = self.items(MODIFIED)
        self.assertTrue(items)
        for path, _ in items:
            with self.subTest(path=path):
                self.assertNotEqual(norm((ROOT / path).read_bytes()), norm(git_show(ref, path)))

    def test_modified_files_give_a_reason(self):
        for path, rest in self.items(MODIFIED):
            with self.subTest(path=path):
                self.assertRegex(rest, r"^ — \S")

    def test_af950833_files_exist(self):
        text = self.notice()
        self.assertEqual(text.splitlines().count(AF950833), 1)
        ours = [p for line in section(text, AF950833) for p in re.findall(r"`([^`]+)`", line)
                if p.startswith("mttl_w01/")]
        self.assertTrue(ours, "no file of ours is named under af950833")
        for path in ours:
            with self.subTest(path=path):
                self.assertTrue((ROOT / path).is_file())

    def test_notice_credits(self):
        text = self.notice()
        for s in ("Tuo", "투오", "af950833", "https://github.com/af950833/mttl_w01"):
            with self.subTest(s=s):
                self.assertIn(s, text)

    def test_notice_credits_mdi(self):
        text = self.notice()
        self.assertEqual(text.splitlines().count(MDI), 1)
        mdi = "\n".join(section(text, MDI))
        for s in ("power-socket-de", "Apache License 2.0", "mttl_w01/icon.png", "mttl_w01/logo.png",
                  "https://github.com/Templarian/MaterialDesign/blob/master/LICENSE"):
            with self.subTest(s=s):
                self.assertIn(s, mdi)


if __name__ == "__main__":
    unittest.main()
