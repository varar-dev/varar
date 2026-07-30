import pytest

from varar_config import Config, parse_config, read_config


def _write(tmp_path, body: str):
    (tmp_path / "varar.config.json").write_text(body, encoding="utf-8")
    return tmp_path


def test_reads_all_keys(tmp_path):
    root = _write(
        tmp_path,
        '{"docs": {"include": ["a/**/*.md"], "exclude": ["a/wip/**"]},'
        ' "steps": ["**/*_steps.py"], "snippets": {"python": "P"}}',
    )
    cfg = read_config(root)
    assert cfg.docs_include == ("a/**/*.md",)
    assert cfg.docs_exclude == ("a/wip/**",)
    assert cfg.steps == ("**/*_steps.py",)
    assert cfg.snippets == {"python": "P"}


def test_missing_file_is_empty_config(tmp_path):
    assert read_config(tmp_path / "nowhere") == Config()


def test_all_keys_optional_and_schema_key_ignored(tmp_path):
    root = _write(tmp_path, '{"$schema": "https://x/y.json"}')
    assert read_config(root) == Config()


def test_malformed_json_raises_with_path(tmp_path):
    root = _write(tmp_path, "{ nope")
    with pytest.raises(ValueError, match=r"varar\.config\.json.*invalid JSON"):
        read_config(root)


def test_unknown_key_raises(tmp_path):
    root = _write(tmp_path, '{"vars": {}}')
    with pytest.raises(ValueError, match="unknown key"):
        read_config(root)


def test_wrong_type_raises(tmp_path):
    root = _write(tmp_path, '{"steps": "x"}')
    with pytest.raises(ValueError, match="steps"):
        read_config(root)


def test_falsy_wrong_type_docs_raises(tmp_path):
    root = _write(tmp_path, '{"docs": false}')
    with pytest.raises(ValueError, match="docs"):
        read_config(root)


def test_falsy_wrong_type_snippets_raises(tmp_path):
    root = _write(tmp_path, '{"snippets": []}')
    with pytest.raises(ValueError, match="snippets"):
        read_config(root)


# ---- The pure parser (issue #11) ----------------------------------------
#
# read_config is the filesystem edge over parse_config. These pin
# the pure half directly: a caller holding the text — an editor buffer, the
# LSP, an in-memory fixture — must be able to validate it without a file.


def test_parse_reads_all_keys_without_touching_the_filesystem():
    cfg = parse_config(
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
        parse_config("{oops", "buffer://untitled")


def test_parse_of_an_empty_object_is_the_empty_config():
    assert parse_config("{}", "<memory>") == Config()


def test_read_delegates_to_parse_and_labels_errors_with_the_path(tmp_path):
    root = _write(tmp_path, "{oops")
    with pytest.raises(ValueError, match="varar.config.json"):
        read_config(root)
