"""Tests for POST /api/verify and the claim-level verification helpers."""

from __future__ import annotations

from backend.schemas import VerifyItem
from backend.services.verification import claim_check, flatten_materials, verify_items
from backend.tests.conftest import S1, S6, valid_materials


def _quote(text, location=None):
    return {"quote": text, "location": location}


# ------------------------------------------------------------- helper behaviour


def test_evidence_quote_present_in_source_is_located(sample_text):
    report = verify_items(
        sample_text,
        [VerifyItem(item_type="summary", content=S1,  # claim restates the source sentence
                    evidence=[{"quote": S1, "location": None}], grounding="SUPPORTED")],
    )
    item = report["items"][0]
    assert item["evidence"][0]["found"] is True
    assert item["needs_review"] is False
    assert item["verified_grounding"] == "SUPPORTED"
    assert report["summary"]["quotes_missing"] == 0
    assert report["verification_level"] == "mechanical"
    assert "does not prove semantic correctness" in report["disclaimer"]


def test_matching_quote_alone_does_not_clear_a_paraphrased_claim(sample_text):
    """A quote that exists in the source still does not prove the claim is entailed."""
    report = verify_items(
        sample_text,
        [VerifyItem(item_type="summary", content="Scheduling always minimises waiting time for every job.",
                    evidence=[{"quote": S6, "location": None}], grounding="SUPPORTED")],
    )
    item = report["items"][0]
    assert item["evidence"][0]["found"] is True
    assert item["needs_review"] is True
    assert item["claim_check"]["status"] in {"uncertain", "weak"}
    assert any("limited overlap" in reason for reason in item["reasons"])


def test_evidence_quote_missing_from_source_is_flagged(sample_text):
    report = verify_items(
        sample_text,
        [VerifyItem(item_type="summary", content="Round Robin is the fastest algorithm.",
                    evidence=[{"quote": "Round Robin is the fastest algorithm ever measured.",
                              "location": None}], grounding="SUPPORTED")],
    )
    item = report["items"][0]
    assert item["evidence"][0]["found"] is False
    assert item["needs_review"] is True
    assert item["reported_grounding"] == "SUPPORTED"
    assert item["verified_grounding"] == "PARTIALLY_SUPPORTED"
    assert any("could not be located" in reason for reason in item["reasons"])


def test_unsupported_item_is_never_upgraded(sample_text):
    report = verify_items(
        sample_text,
        [VerifyItem(item_type="glossary", content="Latency: time to start servicing a request.",
                    evidence=[{"quote": S6, "location": None}], grounding="UNSUPPORTED",
                    warning="Not supported by source.")],
    )
    item = report["items"][0]
    assert item["reported_grounding"] == "UNSUPPORTED"
    assert item["verified_grounding"] == "UNSUPPORTED"
    assert item["needs_review"] is True


def test_partially_supported_item_stays_partially_supported(sample_text):
    report = verify_items(
        sample_text,
        [VerifyItem(item_type="summary", content="Round Robin gives the lowest waiting time.",
                    evidence=[{"quote": S6, "location": None}],
                    grounding="PARTIALLY_SUPPORTED", warning="Notes do not rank algorithms.")],
    )
    item = report["items"][0]
    assert item["verified_grounding"] == "PARTIALLY_SUPPORTED"
    assert item["needs_review"] is True


def test_location_mismatch_is_flagged(sample_text):
    report = verify_items(
        sample_text,
        [VerifyItem(item_type="summary", content="Process scheduling selects a process.",
                    evidence=[{"quote": S1, "location": "Page 9"}], grounding="SUPPORTED")],
        segments=[{"location": "Page 1", "text": sample_text}],
    )
    item = report["items"][0]
    assert item["evidence"][0]["found"] is True
    assert item["evidence"][0]["location_match"] is False
    assert item["needs_review"] is True
    assert any("does not match the location" in reason for reason in item["reasons"])


def test_case_insensitive_match_is_reported_but_still_reviewed(sample_text):
    report = verify_items(
        sample_text,
        [VerifyItem(item_type="summary", content="process scheduling selects a process",
                    evidence=[{"quote": S1.lower(), "location": None}], grounding="SUPPORTED")],
    )
    evidence = report["items"][0]["evidence"][0]
    assert evidence["found"] is True
    assert evidence["match_type"] == "case_insensitive"
    assert report["items"][0]["needs_review"] is True


def test_claim_with_numbers_absent_from_evidence_is_flagged(sample_text):
    check = claim_check("Round Robin cuts waiting time by 45%.", [S6])
    assert check["status"] == "values_not_in_evidence"
    assert "45%" in check["missing_values"]


def test_claim_that_paraphrases_evidence_scores_high():
    check = claim_check("Scheduling algorithms may be compared using waiting time and response time.",
                        [S6])
    assert check["overlap"] >= 0.7
    assert check["status"] == "strong"


def test_empty_evidence_is_flagged(sample_text):
    report = verify_items(
        sample_text,
        [VerifyItem(item_type="summary", content="Some claim without evidence.",
                    evidence=[], grounding="SUPPORTED")],
    )
    item = report["items"][0]
    assert item["needs_review"] is True
    assert item["claim_check"]["status"] == "no_evidence"
    assert any("No supporting quotation" in reason for reason in item["reasons"])


def test_flatten_materials_creates_question_and_answer_items():
    items = flatten_materials(valid_materials())
    types = [item.item_type for item in items]
    assert types.count("question") == 5
    assert types.count("answer") == 5
    assert types.count("summary") == 2
    assert types.count("glossary") == 2


# ------------------------------------------------------------------- endpoint


def test_verify_endpoint_locates_all_sample_quotes(client, sample_text):
    items = flatten_materials(valid_materials())
    response = client.post(
        "/api/verify",
        json={"source_text": sample_text,
              "items": [item.model_dump() for item in items]},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["summary"]["quotes_missing"] == 0
    assert payload["summary"]["total"] == 14
    assert payload["summary"]["unsupported"] >= 1
    assert payload["all_quotes_located"] is True
    assert payload["verification_level"] == "mechanical"


def test_verify_endpoint_accepts_full_materials_object(client, sample_text):
    response = client.post(
        "/api/verify",
        json={"source_text": sample_text, "materials": valid_materials()},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["summary"]["total"] == 14
    assert len([i for i in payload["items"] if i["item_type"] == "question"]) == 5


def test_verify_endpoint_uses_segments_for_locations(client, sample_text):
    response = client.post(
        "/api/verify",
        json={
            "source_text": sample_text,
            "segments": [{"location": "Page 1", "text": sample_text}],
            "items": [{"item_type": "summary", "content": "Process scheduling selects a process.",
                       "evidence": [{"quote": S1, "location": "Page 1"}],
                       "grounding": "SUPPORTED"}],
        },
    )
    payload = response.get_json()
    assert payload["items"][0]["evidence"][0]["actual_location"] == "Page 1"
    assert payload["items"][0]["needs_review"] is False


def test_verify_endpoint_rejects_missing_source(client):
    response = client.post("/api/verify", json={"items": [{"content": "x", "evidence": []}]})
    assert response.status_code == 400


def test_verify_endpoint_rejects_missing_items(client, sample_text):
    response = client.post("/api/verify", json={"source_text": sample_text})
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_input"


def test_verify_endpoint_rejects_empty_items(client, sample_text):
    response = client.post("/api/verify", json={"source_text": sample_text, "items": []})
    assert response.status_code == 400


def test_verify_endpoint_rejects_malformed_items(client, sample_text):
    response = client.post(
        "/api/verify", json={"source_text": sample_text, "items": [{"content": 42}]}
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_items"


def test_verify_endpoint_rejects_bad_materials(client, sample_text):
    response = client.post(
        "/api/verify", json={"source_text": sample_text, "materials": {"summary": "not a list"}}
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_materials"
