"""OpenAI-backed structured generation of study materials.

The model is configurable through ``OPENAI_MODEL`` (default: gpt-4o-mini).
Failures are surfaced as :class:`GenerationError` with an HTTP status and a
machine-readable code so the API can return clear messages.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

import openai
from openai import OpenAI
from pydantic import ValidationError

from backend.config import Config
from backend.schemas import StudyMaterials
from backend.services.extraction import build_marked_source

DEFAULT_MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = (
    "You are a careful educational assistant. Use only the lecture notes supplied by the user. "
    "Do not rely on outside knowledge. Preserve the source's meaning, terminology, qualifications, "
    "numerical values, and relationships. Every factual output item must include an exact supporting "
    "quotation from the source and a source location when available. If the source does not support a "
    "statement, mark it UNSUPPORTED and explain why. Do not invent citations, quotations, definitions, "
    "facts, or answers. Generate a concise summary, a glossary, and exactly five practice questions "
    "with an answer key. Clearly distinguish verified evidence from claims requiring review."
)

_RULES = """Return only JSON matching the required schema.

Rules:
1. summary: 3-6 concise bullet points, each with exact supporting quotations.
2. glossary: the important technical or subject-specific terms from the notes (typically 4-10).
   Write a definition only when the notes support it; otherwise set definition to null,
   grounding to UNSUPPORTED, and explain in warning (e.g. "Not supported by source").
3. questions: EXACTLY 5 questions, numbered 1-5, mixing recall, conceptual and application
   types only where the source supports them. Every question needs an answer and answer evidence.
4. evidence quotes must be copied VERBATIM from the lecture notes below - never reworded,
   never invented. Copy the location marker exactly as given (e.g. "Page 2", "Section: X"),
   or null when the notes carry no location markers.
5. grounding must be SUPPORTED, PARTIALLY_SUPPORTED or UNSUPPORTED. Use warning to explain any
   statement the source does not fully support.
6. Use null for any optional value that does not apply.
"""


def strict_schema(model: type) -> Dict[str, Any]:
    """Convert a Pydantic model schema to an OpenAI strict structured-output schema."""
    schema = model.model_json_schema()

    def walk(node: Any) -> None:
        if isinstance(node, list):
            for child in node:
                walk(child)
            return
        if not isinstance(node, dict):
            return
        properties = node.get("properties")
        if isinstance(properties, dict):
            node["additionalProperties"] = False
            node["required"] = list(properties.keys())
            for child in properties.values():
                walk(child)
        for key in ("items", "anyOf", "$defs", "allOf", "oneOf"):
            if key in node:
                walk(node[key])
        if "definitions" in node:  # pragma: no cover - pydantic v1 style
            walk(node["definitions"])

    walk(schema)
    return schema


def build_messages(source_text: str, segments: List[Dict[str, Any]] | None = None) -> List[Dict[str, str]]:
    marked = build_marked_source(segments) if segments else source_text
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                _RULES
                + "\nLecture notes:\n<source>\n"
                + marked
                + "\n</source>"
            ),
        },
    ]


def call_openai(
    messages: List[Dict[str, str]],
    schema: Dict[str, Any],
    model: str,
    api_key: str | None,
) -> Dict[str, Any]:
    """Single point of contact with the OpenAI API (mocked in tests)."""
    try:
        client = OpenAI(api_key=api_key)
    except openai.OpenAIError as exc:
        raise GenerationError(
            "OPENAI_API_KEY is missing or invalid. Set it to enable live generation, "
            "or use demo mode.",
            status=503,
            code="missing_api_key",
        ) from exc

    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0,
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "study_materials", "strict": True, "schema": schema},
            },
        )
    except openai.RateLimitError as exc:
        raise GenerationError(
            "The AI provider rate limit was reached. Wait a moment and try again.",
            status=429,
            code="rate_limit",
        ) from exc
    except openai.AuthenticationError as exc:
        raise GenerationError(
            "OpenAI authentication failed. Check OPENAI_API_KEY.",
            status=503,
            code="auth_error",
        ) from exc
    except openai.APIConnectionError as exc:
        raise GenerationError(
            "Could not reach the AI provider. Check your network and try again.",
            status=502,
            code="api_unavailable",
        ) from exc
    except openai.APIStatusError as exc:
        raise GenerationError(
            f"The AI provider returned an error (HTTP {exc.status_code}).",
            status=502,
            code="api_error",
        ) from exc
    except openai.OpenAIError as exc:
        raise GenerationError(
            f"The AI request failed: {exc}", status=502, code="api_error"
        ) from exc

    choice = response.choices[0] if getattr(response, "choices", None) else None
    content = choice.message.content if choice else None
    if not content or not content.strip():
        raise GenerationError(
            "The AI returned an empty response.", status=502, code="invalid_response"
        )
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise GenerationError(
            "The AI returned a response that is not valid JSON.",
            status=502,
            code="invalid_response",
        ) from exc
    if not isinstance(data, dict):
        raise GenerationError(
            "The AI returned an unexpected response shape.",
            status=502,
            code="invalid_response",
        )
    return data


class GenerationError(Exception):
    """AI-side failure with an HTTP status and code."""

    def __init__(self, message: str, *, status: int = 502, code: str = "ai_error",
                 details: List[str] | None = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.details = details or []


def _validation_details(exc: ValidationError) -> List[str]:
    details: List[str] = []
    for error in exc.errors()[:5]:
        location = ".".join(str(part) for part in error.get("loc", [])) or "response"
        details.append(f"{location}: {error.get('msg', 'invalid')}")
    return details


def generate_materials(
    source_text: str,
    config: Config,
    segments: List[Dict[str, Any]] | None = None,
    *,
    attempts: int = 2,
) -> StudyMaterials:
    """Generate validated study materials, retrying once with a corrective message."""
    if not config.live_ai_configured:
        raise GenerationError(
            "OPENAI_API_KEY is not configured, so live generation is unavailable. "
            "Use demo mode or configure the key.",
            status=503,
            code="missing_api_key",
        )

    schema = strict_schema(StudyMaterials)
    messages = build_messages(source_text, segments)
    last_error: GenerationError | None = None

    for _ in range(max(1, attempts)):
        data = call_openai(messages, schema, config.openai_model, config.openai_api_key)
        try:
            materials = StudyMaterials.model_validate(data)
        except ValidationError as exc:
            last_error = GenerationError(
                "The AI returned an invalid response that failed schema validation.",
                status=502,
                code="invalid_response",
                details=_validation_details(exc),
            )
            messages = messages + [
                {"role": "assistant", "content": json.dumps(data, default=str)},
                {"role": "user", "content": (
                    "That response failed schema validation. Return the JSON again with every "
                    "required field present. Details: " + "; ".join(last_error.details)
                )},
            ]
            continue

        if len(materials.questions) != 5:
            last_error = GenerationError(
                f"The AI returned {len(materials.questions)} practice questions; exactly 5 "
                "are required.",
                status=502,
                code="question_count",
            )
            messages = messages + [
                {"role": "assistant", "content": json.dumps(data, default=str)},
                {"role": "user", "content": (
                    f"You returned {len(materials.questions)} questions. Return the JSON again "
                    "with EXACTLY 5 practice questions and 5 matching answer-key entries."
                )},
            ]
            continue

        return materials

    raise last_error or GenerationError(
        "AI generation failed.", status=502, code="ai_error"
    )
