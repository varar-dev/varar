"""Run results persisted for the language server (ADR 0014).

The shape is the cross-port contract — the same file the TypeScript vitest
reporter writes — so these assertions are about the wire format, not about
pytest.
"""
import json

STEPS = '''
from varar import steps
param, stimulus, sensor = steps(lambda: {"n": 0})

@stimulus("I add {int}")
def _(state, n):
    return {"n": state["n"] + n}

@sensor("the total is {int}")
def _(state, expected):
    return state["n"]
'''

VAR_CONFIG = """\
{"docs": {"include": ["features/**/*.md"], "exclude": []},
 "steps": ["steps/**/*.steps.py"]}
"""


def _project(pytester):
    (pytester.path / "varar.config.json").write_text(VAR_CONFIG, encoding="utf-8")
    (pytester.path / "steps").mkdir(exist_ok=True)
    (pytester.path / "steps/calc.steps.py").write_text(STEPS.strip(), encoding="utf-8")
    (pytester.path / "features").mkdir(exist_ok=True)


def _results(pytester, oath_path="features/vault.md"):
    return json.loads((pytester.path / ".varar" / f"{oath_path}.json").read_text(encoding="utf-8"))


def test_a_passing_run_writes_the_oath_result(pytester):
    _project(pytester)
    (pytester.path / "features/vault.md").write_text(
        "# Vault\n\nI add 2, and the total is 2.\n", encoding="utf-8"
    )
    pytester.runpytest("-q").assert_outcomes(passed=1)

    results = _results(pytester)
    assert results["version"] == 1
    assert results["oathPath"] == "features/vault.md"
    assert results["sourceHash"].startswith("fnv1a:")
    assert [(e["status"], e["lines"]) for e in results["examples"]] == [("passed", [3])]
    assert "failure" not in results["examples"][0]


def test_a_failing_step_records_its_own_span_not_the_whole_line(pytester):
    _project(pytester)
    source = "# Vault\n\nI add 2, and the total is 99.\n"
    (pytester.path / "features/vault.md").write_text(source, encoding="utf-8")
    pytester.runpytest("-q").assert_outcomes(failed=1)

    failure = _results(pytester)["examples"][0]["failure"]
    # The mismatched cell, not the sentence around it.
    assert source[failure["cells"][0]["from"] : failure["cells"][0]["to"]] == "99"
    assert failure["cells"][0]["actual"] == "2"
    # The anchor lands on the same cell (the failure_anchor rule), so an editor
    # underlines the value rather than the line it sits on.
    assert source[failure["anchor"]["from"] : failure["anchor"]["to"]] == "99"


def test_the_file_is_rewritten_when_a_failure_is_fixed(pytester):
    _project(pytester)
    oath = pytester.path / "features/vault.md"
    oath.write_text("# Vault\n\nI add 2, and the total is 99.\n", encoding="utf-8")
    pytester.runpytest("-q").assert_outcomes(failed=1)
    assert _results(pytester)["examples"][0]["status"] == "failed"

    # A stale result would leave the editor showing a diagnostic the run just
    # cleared, so a passing run must overwrite it.
    oath.write_text("# Vault\n\nI add 2, and the total is 2.\n", encoding="utf-8")
    pytester.runpytest("-q").assert_outcomes(passed=1)
    passed = _results(pytester)["examples"][0]
    assert passed["status"] == "passed"
    assert "failure" not in passed
