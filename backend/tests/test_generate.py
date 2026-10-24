"""Tests for POST /api/generate: demo mode, live generation, validation, AI errors."""

from __future__ import annotations

import types

import openai
import pytest

from backend.services import generation
from backend.tests.conftest import fake_response, valid_materials


def _response(status: int):
    return fake_response(status)


def _client_returning(content: str):
    choice = types.SimpleNamespace(message=types.SimpleNamespace(content=content))
    completions = types.SimpleNamespace(create=lambda **kwargs: types.SimpleNamespace(choices=[choice]))
    return types.SimpleNamespace(chat=types.SimpleNamespace(completions=completions))


def _client_raising(error: Exception):
    def _raise(**kwargs):
        raise error

    completions = types.SimpleNamespace(create=_raise)
    return types.SimpleNamespace(chat=types.SimpleNamespace(completions=completions))


# ------------------------------------------------------------------- demo mode


def test_generate_without_api_key_returns_labelled_demo(client, sample_text):
    response = client.post("/api/generate", json={"text": sample_text})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["mode"] == "demo"
    assert payload["model"] is None
    assert "demo_notice" in payload and payload["demo_notice"]
    assert "NOT generated live" in payload["demo_notice"]
    assert payload["materials"]["questions"][0]["number"] == 1
    assert len(payload["materials"]["questions"]) == 5
    assert payload["checklist_example"], "demo response should carry the sample checklist"
    assert payload["verification"]["summary"]["quotes_missing"] == 0
    assert any("OPENAI_API_KEY" in warning for warning in payload["warnings"])


def test_demo_mode_is_used_even_when_client_asks_for_demo(live_client, sample_text):
    response = live_client.post("/api/generate", json={"text": sample_text, "demo": True})
    assert response.status_code == 200
    assert response.get_json()["mode"] == "demo"


# ------------------------------------------------------------------ live mode


def test_text_input_generation_with_mocked_ai(live_client, sample_text, mock_openai):
    mock_openai(valid_materials())
    response = live_client.post("/api/generate", json={"text": sample_text})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["mode"] == "live"
    assert payload["model"] == "gpt-4o-mini"
    assert payload["demo_notice"] is None
    assert len(payload["materials"]["questions"]) == 5
    assert payload["verification"]["summary"]["total"] == 14  # 2 summary + 2 glossary + 5q + 5a
    assert payload["verification"]["summary"]["quotes_missing"] == 0
    assert any("human review" in warning or "Automated verification" in warning
               for warning in payload["warnings"])


def test_generation_passes_segments_through_to_verification(live_client, sample_text, mock_openai):
    mock_openai(valid_materials())
    segments = [
        {"location": "Page 1", "text": sample_text[:200]},
        {"location": "Page 2", "text": sample_text[200:]},
    ]
    response = live_client.post("/api/generate", json={"text": sample_text, "segments": segments})
    assert response.status_code == 200
    payload = response.get_json()
    located = [
        ev
        for item in payload["verification"]["items"]
        for ev in item["evidence"]
        if ev["found"]
    ]
    assert located and located[0]["actual_location"] in {"Page 1", "Page 2"}


def test_unlocated_evidence_is_flagged_and_never_upgraded(live_client, sample_text, mock_openai):
    materials = valid_materials()
    materials["summary"][0]["evidence"] = [
        {"quote": "This sentence was invented and appears nowhere in the notes.", "location": None}
    ]
    mock_openai(materials)

    response = live_client.post("/api/generate", json={"text": sample_text})
    payload = response.get_json()
    summary_item = payload["verification"]["items"][0]
    assert summary_item["evidence"][0]["found"] is False
    assert summary_item["needs_review"] is True
    assert summary_item["reported_grounding"] == "SUPPORTED"
    assert summary_item["verified_grounding"] == "PARTIALLY_SUPPORTED"
    assert payload["verification"]["summary"]["quotes_missing"] >= 1
    assert any("could not be" in warning for warning in payload["warnings"])


# ------------------------------------------------------------ invalid AI output


def test_exactly_five_questions_required(live_client, sample_text, mock_openai, monkeypatch):
    materials = valid_materials()
    materials["questions"] = materials["questions"][:4]
    calls = {"count": 0}

    def _tracking(*args, **kwargs):
        calls["count"] += 1
        return materials

    monkeypatch.setattr(generation, "call_openai", _tracking)

    response = live_client.post("/api/generate", json={"text": sample_text})
    assert response.status_code == 502
    error = response.get_json()["error"]
    assert error["code"] == "question_count"
    assert "exactly 5" in error["message"]
    assert calls["count"] == 2, "should retry once with a corrective instruction"


def test_malformed_ai_response_is_rejected(live_client, sample_text, mock_openai):
    mock_openai({"summary": [], "glossary": []})  # missing required keys
    response = live_client.post("/api/generate", json={"text": sample_text})
    assert response.status_code == 502
    error = response.get_json()["error"]
    assert error["code"] == "invalid_response"
    assert error["details"]


def test_ai_returning_non_json_structure_is_rejected(live_client, sample_text, mock_openai):
    mock_openai(["not", "an", "object"])
    response = live_client.post("/api/generate", json={"text": sample_text})
    assert response.status_code == 502
    assert response.get_json()["error"]["code"] == "invalid_response"


def test_missing_text_is_rejected(live_client):
    response = live_client.post("/api/generate", json={"notes": "hello"})
    assert response.status_code == 400


def test_empty_text_is_rejected(live_client):
    response = live_client.post("/api/generate", json={"text": "\n\t "})
    assert response.status_code == 400


def test_text_over_limit_is_rejected(make_app):
    client = make_app(api_key="sk-test", max_text_length=40).test_client()
    response = client.post("/api/generate", json={"text": "x" * 41})
    assert response.status_code == 413
    assert response.get_json()["error"]["code"] == "text_too_long"


def test_non_json_body_is_rejected(live_client):
    response = live_client.post("/api/generate", data="text",
                                 content_type="text/plain")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_json"


# ------------------------------------------------------- API failures and keys


def test_generate_materials_without_key_raises_config_error():
    from backend.config import Config

    with pytest.raises(generation.GenerationError) as exc:
        generation.generate_materials("some notes", Config())
    assert exc.value.status == 503
    assert exc.value.code == "missing_api_key"


def test_rate_limit_error_is_mapped(live_client, sample_text, monkeypatch):
    error = openai.RateLimitError("slow down", response=_response(429), body=None)
    monkeypatch.setattr(generation, "OpenAI", lambda api_key=None: _client_raising(error))

    response = live_client.post("/api/generate", json={"text": sample_text})
    assert response.status_code == 429
    assert response.get_json()["error"]["code"] == "rate_limit"


def test_authentication_error_is_mapped(live_client, sample_text, monkeypatch):
    error = openai.AuthenticationError("bad key", response=_response(401), body=None)
    monkeypatch.setattr(generation, "OpenAI", lambda api_key=None: _client_raising(error))

    response = live_client.post("/api/generate", json={"text": sample_text})
    assert response.status_code == 503
    assert response.get_json()["error"]["code"] == "auth_error"


def test_connection_error_is_mapped(live_client, sample_text, monkeypatch):
    error = openai.APIConnectionError(request=fake_response(0).request)
    monkeypatch.setattr(generation, "OpenAI", lambda api_key=None: _client_raising(error))

    response = live_client.post("/api/generate", json={"text": sample_text})
    assert response.status_code == 502
    assert response.get_json()["error"]["code"] == "api_unavailable"


def test_missing_key_at_client_construction_is_mapped(live_client, sample_text, monkeypatch):
    def _no_credentials(api_key=None):
        raise openai.OpenAIError("Missing credentials")

    monkeypatch.setattr(generation, "OpenAI", _no_credentials)
    response = live_client.post("/api/generate", json={"text": sample_text})
    assert response.status_code == 503
    assert response.get_json()["error"]["code"] == "missing_api_key"


def test_empty_model_output_is_mapped(live_client, sample_text, monkeypatch):
    monkeypatch.setattr(generation, "OpenAI", lambda api_key=None: _client_returning(""))
    with pytest.raises(generation.GenerationError) as exc:
        generation.call_openai([], {}, "gpt-4o-mini", "sk-test")
    assert exc.value.code == "invalid_response"


def test_non_json_model_output_is_mapped(monkeypatch):
    monkeypatch.setattr(generation, "OpenAI", lambda api_key=None: _client_returning("{not json"))
    with pytest.raises(generation.GenerationError) as exc:
        generation.call_openai([], {}, "gpt-4o-mini", "sk-test")
    assert exc.value.code == "invalid_response"


def test_prompt_requires_exact_quotations_and_five_questions():
    messages = generation.build_messages("some notes")
    assert messages[0]["role"] == "system"
    system = messages[0]["content"]
    assert "Do not rely on outside knowledge" in system
    assert "exactly five practice questions" in system
    user = messages[1]["content"]
    assert "EXACTLY 5 questions" in user
    assert "VERBATIM" in user
    assert "<source>" in user and "some notes" in user


def test_strict_schema_marks_every_property_required():
    from backend.schemas import StudyMaterials

    schema = generation.strict_schema(StudyMaterials)

    def check(node, path="$"):
        if isinstance(node, dict):
            if "properties" in node:
                assert node["additionalProperties"] is False, path
                assert set(node["required"]) == set(node["properties"]), path
                for key, child in node["properties"].items():
                    check(child, f"{path}.{key}")
            for key in ("items", "anyOf", "$defs"):
                if key in node:
                    check(node[key], f"{path}[{key}]")

    check(schema)
