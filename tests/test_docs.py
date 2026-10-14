import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAIRS = [("README.md", "README.ko.md"), ("docs/install.md", "docs/install.ko.md")]
BILINGUAL = ["mttl_w01/README.md", "mttl_w01/DOCS.md", "NOTICE.md", "mttl_w01/CHANGELOG.md"]
LINKED_DOCS = [*(p for pair in PAIRS for p in pair), *BILINGUAL]
# DOCS.md and CHANGELOG.md are shown in Home Assistant, where relative links do not work,
# so they link to the repository.
REPO_URL = "https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/"
HA_SHOWN = ["mttl_w01/README.md", "mttl_w01/DOCS.md", "mttl_w01/CHANGELOG.md"]
NOTICE_URL = REPO_URL + "NOTICE.md"
# Users add the app collection, not this repository.
HA_APPS = "https://github.com/kkqq9320/ha-apps"
MY_LINK = ("https://my.home-assistant.io/redirect/supervisor_add_addon_repository/"
           "?repository_url=https%3A%2F%2Fgithub.com%2Fkkqq9320%2Fha-apps")
HANGUL = re.compile("[가-힣]")
# A sentence or table cell that ends in 다 without 니 before it, like "있다." or "쓴다 |".
PLAIN_ENDING = re.compile(r"[가-힣](?<!니)다(?:[.)]|\s*\||\s*$)")
LATIN = re.compile("[A-Za-z]")
LINK = re.compile(r"\]\(([^)\s]+)\)")


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def headings(text):
    """(level, title) of each Markdown heading outside fenced code blocks."""
    found, fenced = [], False
    for line in text.splitlines():
        if line.startswith("```"):
            fenced = not fenced
            continue
        m = not fenced and re.match(r"^(#{1,6}) (.+)$", line)
        if m:
            found.append((len(m.group(1)), m.group(2).strip()))
    return found


def slug(title):
    """GitHub's heading anchor: lower case, punctuation dropped, spaces turned into hyphens."""
    title = re.sub(r"[^\w\- ]", "", title.lower())
    return title.replace(" ", "-")


class DocsTest(unittest.TestCase):
    def assertFiles(self, *rels):
        for rel in rels:
            self.assertTrue((ROOT / rel).is_file(), f"{rel} is missing")

    def test_pairs_exist_and_link_each_other(self):
        for en, ko in PAIRS:
            with self.subTest(pair=en):
                self.assertFiles(en, ko)
                for src, dst in ((en, ko), (ko, en)):
                    top = [line for line in read(src).splitlines() if line.strip()][:3]
                    self.assertTrue(any(f"]({Path(dst).name})" in line for line in top),
                                    f"{src} does not link {Path(dst).name} at the top")

    def test_pairs_have_same_heading_levels(self):
        for en, ko in PAIRS:
            with self.subTest(pair=en):
                self.assertFiles(en, ko)
                levels_en = [level for level, _ in headings(read(en))]
                levels_ko = [level for level, _ in headings(read(ko))]
                self.assertTrue(levels_en)
                self.assertEqual(levels_en, levels_ko)

    def test_bilingual_single_files(self):
        for rel in BILINGUAL:
            with self.subTest(file=rel):
                self.assertFiles(rel)
                titles = [title for _, title in headings(read(rel))]
                self.assertTrue(any(HANGUL.search(t) for t in titles), "no Korean heading")
                self.assertTrue(any(LATIN.search(HANGUL.sub("", t)) for t in titles), "no English heading")

    def test_links_resolve(self):
        for rel in LINKED_DOCS:
            self.assertFiles(rel)
            for target in LINK.findall(read(rel)):
                if target.startswith(REPO_URL):
                    path, _, anchor = target[len(REPO_URL):].partition("#")
                    dest = ROOT / path
                elif re.match(r"^[a-z]+:", target):
                    continue
                else:
                    path, _, anchor = target.partition("#")
                    dest = (ROOT / rel).parent / path if path else ROOT / rel
                with self.subTest(file=rel, link=target):
                    self.assertTrue(dest.is_file(), f"{dest} is missing")
                    if anchor:
                        anchors = {slug(title) for _, title in headings(dest.read_text(encoding="utf-8"))}
                        self.assertIn(anchor, anchors)

    def test_ha_shown_docs_use_absolute_links(self):
        for rel in HA_SHOWN:
            for target in LINK.findall(read(rel)):
                with self.subTest(file=rel, link=target):
                    self.assertTrue(target.startswith("https://"), target)

    def test_install_docs_point_to_ha_apps(self):
        for rel in ("README.md", "README.ko.md", "docs/install.md", "docs/install.ko.md"):
            with self.subTest(file=rel):
                text = read(rel)
                self.assertIn(HA_APPS, text)
                self.assertIn(MY_LINK, text)
                self.assertNotIn("repository_url=https%3A%2F%2Fgithub.com%2Fkkqq9320%2Fha-lgu-mttl-w01", text)
                # The old "add this repository" step quoted this repository's address.
                self.assertNotIn("`https://github.com/kkqq9320/ha-lgu-mttl-w01`", text)

    def test_ha_shown_docs_credit_notice(self):
        for rel in ("mttl_w01/README.md", "mttl_w01/DOCS.md"):
            with self.subTest(file=rel):
                text = read(rel)
                self.assertIn(NOTICE_URL, text)
                # Compare the text a reader sees: link labels without their targets.
                shown = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
                for s in ("투오 of the Naver HA Cafe", "네이버 HA 카페 투오님", "af950833", "power-socket-de"):
                    self.assertIn(s, shown)

    def test_tuo_is_named_in_hangul(self):
        # 투오님's name is not "Tuo" in English either; branch and tag names (`tuo`, `tuo-*`) are lower case.
        for rel in (*LINKED_DOCS, "mttl_w01/config.yaml", "mttl_w01/Dockerfile", "mttl_w01/run.py"):
            with self.subTest(file=rel):
                self.assertNotRegex(read(rel), r"\bTuo\b")

    def test_korean_docs_use_polite_style(self):
        # Korean sentences end in -니다 (습니다체), not the plain -다.
        for rel in ("README.ko.md", "docs/install.ko.md", "mttl_w01/translations/ko.yaml", *BILINGUAL):
            fenced = False
            for number, line in enumerate(read(rel).splitlines(), 1):
                if line.startswith("```"):
                    fenced = not fenced
                if fenced or not HANGUL.search(line):
                    continue
                with self.subTest(file=rel, line=number):
                    self.assertNotRegex(line, PLAIN_ENDING)


if __name__ == "__main__":
    unittest.main()
