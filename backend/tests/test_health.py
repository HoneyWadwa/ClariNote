"""Tests for GET /api/health."""

from __future__ import annotations


def test_health_reports_ok_without_api_key(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "ok"
    assert payload["live_ai_configured"] is False
    assert payload["demo_mode"] is True
    assert payload["model"] == "gpt-4o-mini"
    assert payload["allowed_file_types"] == ["txt", "pdf", "docx"]
    assert payload["limits"]["max_file_mb"] == 5
    assert payload["limits"]["max_text_length"] == 60_000


def test_health_never_exposes_the_api_key(client, live_client):
    for test_client in (client, live_client):
        response = test_client.get("/api/health")
        body = response.get_data(as_text=True)
        assert response.status_code == 200
        assert "sk-test-not-a-real-key" not in body
        assert "OPENAI_API_KEY" not in body
        assert "api_key" not in response.get_json()


def test_health_reports_live_ai_when_key_configured(live_client):
    payload = live_client.get("/api/health").get_json()
    assert payload["live_ai_configured"] is True
    assert payload["demo_mode"] is False


def test_sample_endpoint_returns_input_fixture(client):
    response = client.get("/api/sample")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["filename"] == "sample_input.txt"
    assert payload["text"].startswith("Process scheduling is an operating system function")
    assert payload["char_count"] == len(payload["text"])
    # This is an input fixture, never a pre-baked result.
    assert "materials" not in payload


def test_unknown_api_endpoint_returns_json(client):
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


def test_wrong_method_returns_json(client):
    response = client.get("/api/generate")
    assert response.status_code == 405
    assert response.get_json()["error"]["code"] == "method_not_allowed"
