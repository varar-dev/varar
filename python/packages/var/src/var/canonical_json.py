import json
from typing import Any


def canonical_stringify(value: Any) -> str:
    """Serialize a value to canonical JSON format.

    Produces output byte-for-byte compatible with JS:
    JSON.stringify(sortKeys(value), null, 2) + "\\n"

    - sort_keys=True: recursively sorts all object keys
    - indent=2: 2-space indentation
    - ensure_ascii=False: keeps non-ASCII characters raw (emojis, accents)
    - separators=(",", ": "): compact separators matching JSON.stringify
    - trailing newline appended
    """
    return json.dumps(
        value,
        sort_keys=True,
        indent=2,
        ensure_ascii=False,
        separators=(",", ": ")
    ) + "\n"
