from var_runner.config import read_var_config


def _write(tmp_path, body):
    p = tmp_path / "pyproject.toml"
    p.write_text(body, encoding="utf-8")
    return p


def test_reads_include_exclude_and_steps(tmp_path):
    p = _write(
        tmp_path,
        """
[tool.var]
vars = { include = ["features/**/*.md"], exclude = ["**/wip/**"] }
steps = ["tests/steps/**/*.steps.py"]
""",
    )
    cfg = read_var_config(p)
    assert cfg.vars_include == ("features/**/*.md",)
    assert cfg.vars_exclude == ("**/wip/**",)
    assert cfg.steps == ("tests/steps/**/*.steps.py",)


def test_bare_list_is_include_shorthand(tmp_path):
    p = _write(tmp_path, '[tool.var]\nvars = ["a/**/*.md"]\n')
    cfg = read_var_config(p)
    assert cfg.vars_include == ("a/**/*.md",) and cfg.vars_exclude == ()


def test_missing_table_is_empty(tmp_path):
    p = _write(tmp_path, "[project]\nname='x'\nversion='0'\n")
    cfg = read_var_config(p)
    assert cfg.vars_include == () and cfg.steps == ()
