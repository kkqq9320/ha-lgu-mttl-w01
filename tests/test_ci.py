import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
USES = re.compile(r"^\s*(?:- )?uses:\s*(\S+)\s*$", re.MULTILINE)


def workflow_text():
    return WORKFLOW.read_text(encoding="utf-8")


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

    def test_runs_on_push_and_pull_request(self):
        lines = workflow_text().splitlines()
        self.assertIn("on:", lines)
        self.assertIn("  push:", lines)
        self.assertIn("  pull_request:", lines)

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

    def test_actions_are_pinned_to_a_major_tag(self):
        uses = USES.findall(workflow_text())
        self.assertTrue(uses)
        for ref in uses:
            with self.subTest(ref=ref):
                self.assertRegex(ref, r"^[\w.-]+/[\w.-]+@v\d+$")


if __name__ == "__main__":
    unittest.main()
