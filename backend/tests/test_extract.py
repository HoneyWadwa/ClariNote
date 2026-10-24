"""Tests for POST /api/extract: text, TXT, PDF, DOCX and upload restrictions."""

from __future__ import annotations

import io

from backend.tests.conftest import build_docx, build_pdf


def upload(client, filename: str, data: bytes):
    return client.post(
        "/api/extract",
        data={"file": (io.BytesIO(data), filename)},
        content_type="multipart/form-data",
    )


# --------------------------------------------------------------------- happy paths


def test_extract_pasted_text(client, sample_text):
    response = client.post("/api/extract", json={"text": sample_text})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["file_type"] == "text"
    assert payload["text"].strip() == sample_text.strip()
    assert payload["char_count"] == len(sample_text.strip())
    assert payload["segments"][0]["location"] == "Input text"
    assert payload["validation"]["ok"] is True


def test_extract_txt_file(client, sample_text):
    response = upload(client, "notes.txt", sample_text.encode("utf-8"))
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["file_type"] == "txt"
    assert payload["filename"] == "notes.txt"
    assert payload["size_bytes"] == len(sample_text.encode("utf-8"))
    assert payload["text"].strip() == sample_text.strip()


def test_extract_pdf_records_page_numbers(client, sample_text):
    response = upload(client, "lecture.pdf", build_pdf(sample_text))
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["file_type"] == "pdf"
    assert payload["segments"][0]["location"] == "Page 1"
    assert all(location.startswith("Page ") for location in payload["locations"])
    assert "Process scheduling" in payload["text"]
    # PDF text extraction inserts line breaks: check the wording survives whitespace.
    assert "Scheduling algorithms can differ" in " ".join(payload["text"].split())


def test_extract_docx_records_section_heading(client, sample_text):
    response = upload(client, "lecture.docx", build_docx(sample_text))
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["file_type"] == "docx"
    assert payload["locations"] == ["Section: Operating Systems Lecture"]
    assert "Round Robin" in payload["text"]


def test_extract_returns_page_info_for_multi_page_pdf(client, sample_text):
    response = upload(client, "lecture.pdf", build_pdf(sample_text, lines_per_page=3))
    payload = response.get_json()
    assert len(payload["segments"]) > 1
    assert payload["locations"][-1] != payload["locations"][0]


# --------------------------------------------------------------- invalid input


def test_empty_text_is_rejected(client):
    response = client.post("/api/extract", json={"text": "   \n  "})
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_input"


def test_missing_text_field_is_rejected(client):
    response = client.post("/api/extract", json={"notes": "hello"})
    assert response.status_code == 400


def test_text_longer_than_limit_is_rejected(make_app):
    client = make_app(max_text_length=50).test_client()
    response = client.post("/api/extract", json={"text": "word " * 40})
    assert response.status_code == 413
    assert response.get_json()["error"]["code"] == "text_too_long"


def test_unsupported_file_type_is_rejected(client):
    response = upload(client, "lecture.pptx", b"binary-ish content")
    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["code"] == "unsupported_file_type"
    assert "Unsupported file type" in error["message"]
    assert "DOCX" in error["message"]


def test_file_without_extension_is_rejected(client):
    response = upload(client, "lecture", b"some text")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "unsupported_file_type"


def test_empty_file_is_rejected(client):
    response = upload(client, "notes.txt", b"")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "empty_file"


def test_oversized_file_is_rejected(make_app):
    client = make_app(max_file_mb=1).test_client()
    response = upload(client, "big.txt", b"a" * (1024 * 1024 + 1024))
    assert response.status_code == 413
    assert response.get_json()["error"]["code"] == "file_too_large"


def test_malformed_pdf_is_rejected(client):
    response = upload(client, "broken.pdf", b"%PDF-1.7 this is not really a pdf")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "malformed_document"


def test_malformed_docx_is_rejected(client):
    response = upload(client, "broken.docx", b"PK\x03\x04 not really a zip archive")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "malformed_document"


def test_pdf_without_extractable_text_is_rejected(client):
    import pymupdf

    document = pymupdf.open()
    document.new_page()
    data = document.tobytes()
    document.close()

    response = upload(client, "blank.pdf", data)
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "no_text_found"


def test_request_without_file_or_json_is_rejected(client):
    response = client.post("/api/extract", data="plain body",
                           content_type="text/plain")
    assert response.status_code == 415
    assert response.get_json()["error"]["code"] == "unsupported_media_type"


def test_multipart_request_without_file_field_is_rejected(client):
    response = client.post(
        "/api/extract",
        data={"other": (io.BytesIO(b"hi"), "notes.txt")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "missing_file"
