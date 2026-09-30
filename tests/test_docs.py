import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAIRS = [("README.md", "README.ko.md"), ("docs/install.md", "docs/install.ko.md")]
BILINGUAL = ["mttl_w01/DOCS.md", "NOTICE.md", "mttl_w01/CHANGELOG.md"]
LINKED_DOCS = [*(p for pair in PAIRS for p in pair), "mttl_w01/DOCS.md", "NOTICE.md"]
# DOCS.md is shown in Home Assistant, where relative links do not work, so it links to the repository.
REPO_URL = "https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/"
HANGUL = re.compile("[가-힣]")
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


if __name__ == "__main__":
    unittest.main()
