import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
RELEASE = ROOT / ".github" / "workflows" / "release.yml"
USES = re.compile(r"^\s*(?:- )?uses:\s*(\S+)\s*$", re.MULTILINE)
# Home Assistant's build actions are released with date tags (for example 2026.09.0).
BUILDER = r"^home-assistant/builder/actions/(prepare-multi-arch-matrix|build-image|publish-multi-arch-manifest)@\d{4}\.\d{2}\.\d+$"


def workflow_text():
    return WORKFLOW.read_text(encoding="utf-8")


def release_text():
    return RELEASE.read_text(encoding="utf-8")


def job_block(text, name):
    """Lines of the job `name:` (two-space indent under `jobs:`), up to the next job."""
    lines = text.splitlines()
    start = lines.index(f"  {name}:") + 1
    end = next((i for i in range(start, len(lines)) if re.match(r"^  \S", lines[i])), len(lines))
    return "\n".join(lines[start:end])


class CiTest(unittest.TestCase):
    def test_ci_runs_both_suites_and_linter(self):
        text = workflow_text()
        for s in ("fetch-depth: 0", "python -m unittest discover -s tests -v",
                  'node --test "tests/js/*.test.mjs"',
                  "frenck/action-addon-linter@v2", "path: ./mttl_w01"):
            with self.subTest(s=s):
                self.assertIn(s, text)

    def test_runs_on_main_push_pull_request_and_call(self):
        lines = workflow_text().splitlines()
        for line in ("on:", "  push:", "    branches: [main]", "  pull_request:", "  workflow_call:"):
            with self.subTest(line=line):
                self.assertIn(line, lines)

    def test_token_is_read_only(self):
        self.assertIn("permissions:\n  contents: read\n", workflow_text())

    def test_three_jobs_with_expected_setup(self):
        text = workflow_text()
        unittest_job = job_block(text, "unittest")
        # The tests read the `tuo` branch through git, so the checkout needs the full history.
        self.assertIn("fetch-depth: 0", unittest_job)
        self.assertIn("actions/setup-python@", unittest_job)
        self.assertIn('python-version: "3.12"', unittest_job)
        self.assertIn("python -m unittest discover -s tests -v", unittest_job)

        node_job = job_block(text, "node")
        self.assertIn("actions/setup-node@", node_job)
        self.assertIn('node-version: "24"', node_job)
        self.assertIn('node --test "tests/js/*.test.mjs"', node_job)

        lint_job = job_block(text, "lint")
        self.assertIn("frenck/action-addon-linter@v2", lint_job)
        self.assertIn("path: ./mttl_w01", lint_job)

    def test_ci_build_job_does_not_publish(self):
        text = workflow_text()
        build = job_block(text, "build")
        # release.yml calls this workflow for its tests only; it builds and publishes on its own.
        for s in ("if: github.event_name != 'release'", "cp NOTICE.md LICENSE mttl_w01/",
                  "home-assistant/builder/actions/build-image@", "context: ./mttl_w01",
                  'push: "false"', 'cosign: "false"', "ubuntu-24.04-arm"):
            with self.subTest(s=s):
                self.assertIn(s, build)
        self.assertNotIn("packages: write", text)
        self.assertNotIn("id-token: write", text)

    def test_release_trigger_and_permissions(self):
        rel = release_text()
        self.assertIn("on:\n  release:\n    types: [published]\n", rel)
        self.assertIn("permissions:\n  contents: read\n", rel)
        for job in ("build", "manifest"):
            with self.subTest(job=job):
                self.assertIn("packages: write", job_block(rel, job))
                self.assertIn("id-token: write", job_block(rel, job))
        for job in ("tests", "version", "matrix"):
            with self.subTest(job=job):
                self.assertNotIn("packages: write", job_block(rel, job))

    def test_release_tests_and_version_gate_the_build(self):
        rel = release_text()
        self.assertIn("uses: ./.github/workflows/ci.yml", job_block(rel, "tests"))
        self.assertIn('python tools/release_info.py "$TAG"', job_block(rel, "version"))
        self.assertIn("TAG: ${{ github.event.release.tag_name }}", job_block(rel, "version"))
        self.assertIn("needs: [tests, version]", job_block(rel, "matrix"))
        self.assertIn("needs: [matrix, version]", job_block(rel, "build"))
        self.assertIn("needs: [build, version]", job_block(rel, "manifest"))

    def test_release_publishes_with_builder_actions(self):
        rel = release_text()
        for s in ("image-name: mttl_w01", "context: ./mttl_w01", "cp NOTICE.md LICENSE mttl_w01/",
                  'push: "true"', "io.hass.type=app",
                  "${{ needs.version.outputs.version }}\n            latest"):
            with self.subTest(s=s):
                self.assertIn(s, rel)
        # skip-existing keeps a published version from being overwritten by a second release.
        self.assertEqual(rel.count("skip-existing: ${{ needs.version.outputs.version }}"), 2)
        self.assertIn('ARCHITECTURES: \'["amd64", "aarch64"]\'', rel)

    def test_actions_are_pinned(self):
        for path in (WORKFLOW, RELEASE):
            uses = USES.findall(path.read_text(encoding="utf-8"))
            self.assertTrue(uses, path.name)
            for ref in uses:
                with self.subTest(file=path.name, ref=ref):
                    if ref == "./.github/workflows/ci.yml":
                        continue
                    if ref.startswith("home-assistant/builder/"):
                        self.assertRegex(ref, BUILDER)
                    else:
                        self.assertRegex(ref, r"^[\w.-]+/[\w.-]+@v\d+$")


if __name__ == "__main__":
    unittest.main()
