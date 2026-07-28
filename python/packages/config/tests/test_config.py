import pytest

from varar_config import VarConfig, parse_varar_config, read_varar_config


def _write(tmp_path, body: str):
    (tmp_path / "varar.config.json").write_text(body, encoding="utf-8")
    return tmp_path


def test_reads_all_keys(tmp_path):
    root = _write(
        tmp_path,
        '{"docs": {"include": ["a/**/*.md"], "exclude": ["a/wip/**"]},'
        ' "steps": ["**/*_steps.py"], "snippets": {"python": "P"}}',
    )
    cfg = read_varar_config(root)
    assert cfg.docs_include == ("a/**/*.md",)
    assert cfg.docs_exclude == ("a/wip/**",)
    assert cfg.steps == ("**/*_steps.py",)
    assert cfg.snippets == {"python": "P"}


def test_missing_file_is_empty_config(tmp_path):
    assert read_varar_config(tmp_path / "nowhere") == VarConfig()


def test_all_keys_optional_and_schema_key_ignored(tmp_path):
    root = _write(tmp_path, '{"$schema": "https://x/y.json"}')
    assert read_varar_config(root) == VarConfig()


def test_malformed_json_raises_with_path(tmp_path):
    root = _write(tmp_path, "{ nope")
    with pytest.raises(ValueError, match=r"varar\.config\.json.*invalid JSON"):
        read_varar_config(root)


def test_unknown_key_raises(tmp_path):
    root = _write(tmp_path, '{"vars": {}}')
    with pytest.raises(ValueError, match="unknown key"):
        read_varar_config(root)


def test_wrong_type_raises(tmp_path):
    root = _write(tmp_path, '{"steps": "x"}')
    with pytest.raises(ValueError, match="steps"):
        read_varar_config(root)


def test_falsy_wrong_type_docs_raises(tmp_path):
    root = _write(tmp_path, '{"docs": false}')
    with pytest.raises(ValueError, match="docs"):
        read_varar_config(root)


def test_falsy_wrong_type_snippets_raises(tmp_path):
    root = _write(tmp_path, '{"snippets": []}')
    with pytest.raises(ValueError, match="snippets"):
        read_varar_config(root)


# ---- The pure parser (issue #11) ----------------------------------------
#
# read_varar_config is the filesystem edge over parse_varar_config. These pin
# the pure half directly: a caller holding the text — an editor buffer, the
# LSP, an in-memory fixture — must be able to validate it without a file.


def test_parse_reads_all_keys_without_touching_the_filesystem():
    cfg = parse_varar_config(
        '{"docs": {"include": ["a/**/*.md"], "exclude": ["a/wip/**"]},'
        ' "steps": ["**/*_steps.py"], "snippets": {"python": "P"}}',
        "<memory>",
    )
    assert cfg.docs_include == ("a/**/*.md",)
    assert cfg.docs_exclude == ("a/wip/**",)
    assert cfg.steps == ("**/*_steps.py",)
    assert cfg.snippets == {"python": "P"}


def test_parse_labels_errors_with_the_given_source():
    with pytest.raises(ValueError, match="buffer://untitled"):
        parse_varar_config("{oops", "buffer://untitled")


def test_parse_of_an_empty_object_is_the_empty_config():
    assert parse_varar_config("{}", "<memory>") == VarConfig()


def test_read_delegates_to_parse_and_labels_errors_with_the_path(tmp_path):
    root = _write(tmp_path, "{oops")
    with pytest.raises(ValueError, match="varar.config.json"):
        read_varar_config(root)
