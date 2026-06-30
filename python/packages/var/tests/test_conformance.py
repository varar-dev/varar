"""test_conformance.py — parametrized var-doc conformance harness.

For each bundle under conformance/bundles/, parses example.md, projects it
to the var-doc artifact, and asserts byte-for-byte equality with the
committed golden/var-doc.json.
"""

from pathlib import Path

import pytest

from var.canonical_json import canonical_stringify
from var.conformance import to_var_doc_artifact
from var.parse import parse

# python/packages/var/tests/ -> parents[4] = repo root
BUNDLES_DIR = Path(__file__).resolve().parents[4] / "conformance" / "bundles"
BUNDLES = sorted(p for p in BUNDLES_DIR.iterdir() if p.is_dir())


@pytest.mark.parametrize("bundle", BUNDLES, ids=lambda b: b.name)
def test_var_doc_matches_golden(bundle: Path) -> None:
    source = (bundle / "example.md").read_text(encoding="utf-8")
    doc = parse("example.md", source)
    artifact = to_var_doc_artifact(doc)
    actual = canonical_stringify(artifact)
    expected = (bundle / "golden" / "var-doc.json").read_text(encoding="utf-8")
    assert actual == expected
