"""Bundled demo sample: a fixed, hand-checked input/output pair.

Used only when no OPENAI_API_KEY is configured (or when the client explicitly
requests demo mode). The response is always labelled with ``mode: "demo"`` so
the UI can state plainly that nothing was generated live.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from backend.schemas import StudyMaterials
from backend.services.verification import flatten_materials, verify_items

_SAMPLE_DIR = Path(__file__).resolve().parents[2] / "sample"
_INPUT_PATH = _SAMPLE_DIR / "sample_input.txt"
_OUTPUT_PATH = _SAMPLE_DIR / "sample_output.json"

DEMO_NOTICE = (
    "Demo mode: no OPENAI_API_KEY is configured (or demo mode was requested). "
    "This is a fixed, hand-checked sample built from the bundled sample lecture notes "
    "(sample/sample_input.txt). It was NOT generated live from your input."
)


def load_sample_input() -> str:
    return _INPUT_PATH.read_text(encoding="utf-8")


def load_sample_output() -> Dict[str, Any]:
    return json.loads(_OUTPUT_PATH.read_text(encoding="utf-8"))


def demo_response() -> Dict[str, Any]:
    """Full /api/generate response shape for the bundled sample."""
    sample = load_sample_output()
    materials = sample["materials"]
    # Validate the bundled sample against the same schema the AI must satisfy.
    StudyMaterials.model_validate(materials)
    source = load_sample_input()
    segments = [{"location": "Sample lecture notes", "text": source}]

    return {
        "mode": "demo",
        "model": None,
        "demo_notice": DEMO_NOTICE,
        "checklist_example": sample.get("checklist_example", []),
        "materials": materials,
        "verification": verify_items(source, flatten_materials(materials), segments),
        "warnings": [DEMO_NOTICE],
    }
