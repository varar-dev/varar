from pathlib import Path

from var_runner.discovery import find_specs, match_spec


def _touch(root: Path, rel: str) -> Path:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("", encoding="utf-8")
    return p


def test_find_specs_include_minus_exclude(tmp_path: Path) -> None:
    _touch(tmp_path, "features/a.md")
    _touch(tmp_path, "features/wip/b.md")
    _touch(tmp_path, "README.md")
    found = find_specs(["features/**/*.md"], ["**/wip/**"], tmp_path)
    assert found == (tmp_path / "features/a.md",)


def test_match_spec(tmp_path: Path) -> None:
    inc, exc = ["features/**/*.md"], ["**/wip/**"]
    assert match_spec(tmp_path / "features/a.md", inc, exc, tmp_path) is True
    assert match_spec(tmp_path / "features/wip/b.md", inc, exc, tmp_path) is False
    assert match_spec(tmp_path / "README.md", inc, exc, tmp_path) is False


def test_deeply_nested_spec_matches(tmp_path: Path) -> None:
    """features/**/*.md must match specs nested more than one level deep."""
    inc, exc = ["features/**/*.md"], []
    assert match_spec(tmp_path / "features/sub/deep/c.md", inc, exc, tmp_path) is True
    assert match_spec(tmp_path / "features/sub/c.md", inc, exc, tmp_path) is True
    assert match_spec(tmp_path / "features/c.md", inc, exc, tmp_path) is True
