"""LectureLens AI - Flask API.

Endpoints
---------
GET  /api/health   - service health and whether live AI generation is configured
GET  /api/sample   - the bundled sample lecture notes (input fixture for the UI)
POST /api/extract  - extract text (with page/section info) from TXT/PDF/DOCX or plain text
POST /api/generate - generate summary, glossary, 5 questions + answer key, with evidence
POST /api/verify   - verify that evidence quotations exist in the source and flag claims
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.config import ALLOWED_FILE_TYPES, Config
from backend.schemas import StudyMaterials, VerifyItem
from backend.services import demo_data, generation, verification
from backend.services.extraction import (
    ExtractionError,
    extract_text,
    extract_uploaded,
    validate_text,
)

logger = logging.getLogger("lecturelens")

MAX_VERIFY_ITEMS = 500


class ApiError(Exception):
    """Structured API error returned as JSON."""

    def __init__(self, message: str, *, status: int = 400, code: str = "bad_request",
                 details: Optional[List[str]] = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.details = details or []


def _error_payload(message: str, code: str, details: Optional[List[str]] = None) -> Dict[str, Any]:
    error: Dict[str, Any] = {"code": code, "message": message}
    if details:
        error["details"] = details
    return {"error": error}


def _json_body() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(
            "Request body must be a JSON object with a Content-Type of application/json.",
            code="invalid_json",
        )
    return data


def _clean_segments(raw: Any) -> Optional[List[Dict[str, Any]]]:
    """Validate an optional client-supplied segment list."""
    if raw is None:
        return None
    if not isinstance(raw, list) or not raw:
        raise ApiError(
            "'segments' must be a non-empty list of {location, text} objects.",
            code="invalid_segments",
        )
    segments: List[Dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict) or not isinstance(entry.get("text"), str):
            raise ApiError(
                "Each segment must be an object with a 'text' string.", code="invalid_segments"
            )
        location = entry.get("location")
        segments.append(
            {"location": location if isinstance(location, str) and location.strip() else None,
             "text": entry["text"]}
        )
    if not any(seg["text"].strip() for seg in segments):
        raise ApiError("The supplied segments contain no text.", code="invalid_segments")
    return segments


def create_app(config: Optional[Config] = None) -> Flask:
    app = Flask(__name__)
    resolved = config or Config.from_env()
    app.config["APP_CONFIG"] = resolved
    app.config["MAX_CONTENT_LENGTH"] = resolved.max_file_bytes + (1024 * 1024)

    def cfg() -> Config:
        return app.config["APP_CONFIG"]

    # ------------------------------------------------------------------ health
    @app.get("/api/health")
    def health():
        return jsonify(
            {
                "status": "ok",
                "service": "lecturelens-api",
                "live_ai_configured": cfg().live_ai_configured,
                "model": cfg().openai_model,
                "demo_mode": not cfg().live_ai_configured,
                "allowed_file_types": list(ALLOWED_FILE_TYPES),
                "limits": {
                    "max_file_mb": cfg().max_file_mb,
                    "max_text_length": cfg().max_text_length,
                },
            }
        )

    # ------------------------------------------------------------------ sample
    @app.get("/api/sample")
    def sample():
        """Sample *input* notes for the UI's 'Load sample lecture' action.

        Input fixture only - it is never presented as generated output.
        """
        text = demo_data.load_sample_input()
        return jsonify(
            {
                "filename": "sample_input.txt",
                "file_type": "txt",
                "char_count": len(text),
                "text": text,
            }
        )

    # ----------------------------------------------------------------- extract
    @app.post("/api/extract")
    def extract():
        content_type = request.content_type or ""
        if request.is_json or "application/json" in content_type:
            body = _json_body()
            text = body.get("text")
            if not isinstance(text, str):
                raise ApiError("Provide the lecture notes as a 'text' string.", code="invalid_input")
            payload = extract_text(text, cfg())
        elif "multipart/form-data" in content_type:
            file = request.files.get("file") or request.files.get("notes")
            if file is None:
                raise ApiError("No file was uploaded under the 'file' field.", code="missing_file")
            payload = extract_uploaded(file, cfg())
        else:
            raise ApiError(
                "Send multipart/form-data with a 'file', or JSON with a 'text' field.",
                status=415,
                code="unsupported_media_type",
                details=["multipart/form-data", "application/json"],
            )
        payload["validation"] = {
            "ok": True,
            "max_text_length": cfg().max_text_length,
            "max_file_mb": cfg().max_file_mb,
        }
        return jsonify(payload)

    # --------------------------------------------------------------- generate
    @app.post("/api/generate")
    def generate():
        body = _json_body()
        text = body.get("text")
        if not isinstance(text, str):
            raise ApiError("Provide the lecture notes as a 'text' string.", code="invalid_input")
        clean_text = validate_text(text, cfg())
        segments = _clean_segments(body.get("segments"))
        if segments is None:
            segments = [{"location": "Input text", "text": clean_text}]

        demo_requested = body.get("demo") is True
        use_demo = demo_requested or not cfg().live_ai_configured

        if use_demo:
            payload = demo_data.demo_response()
            payload["warnings"] = list(payload.get("warnings", []))
            if not cfg().live_ai_configured:
                payload["warnings"].append(
                    "Live AI generation is unavailable because OPENAI_API_KEY is not configured."
                )
            return jsonify(payload)

        materials = generation.generate_materials(clean_text, cfg(), segments)
        materials_dict = materials.model_dump(mode="json")
        report = verification.verify_items(
            clean_text, verification.flatten_materials(materials_dict), segments
        )

        warnings: List[str] = []
        if report["summary"]["quotes_missing"]:
            warnings.append(
                f"{report['summary']['quotes_missing']} evidence quotation(s) could not be "
                "located in the source and are marked for review."
            )
        if report["summary"]["needs_review"]:
            warnings.append(
                f"{report['summary']['needs_review']} item(s) require human review before use."
            )

        return jsonify(
            {
                "mode": "live",
                "model": cfg().openai_model,
                "demo_notice": None,
                "char_count": len(clean_text),
                "materials": materials_dict,
                "verification": report,
                "warnings": warnings,
            }
        )

    # ----------------------------------------------------------------- verify
    @app.post("/api/verify")
    def verify():
        body = _json_body()
        source = body.get("source_text")
        if not isinstance(source, str) or not source.strip():
            raise ApiError(
                "Provide 'source_text' - the original lecture notes to check evidence against.",
                code="invalid_input",
            )
        if len(source) > cfg().max_text_length:
            raise ApiError(
                f"'source_text' is too long (limit {cfg().max_text_length:,} characters).",
                status=413,
                code="text_too_long",
            )
        segments = _clean_segments(body.get("segments"))
        if segments is None:
            segments = [{"location": None, "text": source}]

        raw_items = body.get("items")
        if raw_items is None and body.get("materials") is not None:
            try:
                materials = StudyMaterials.model_validate(body["materials"])
            except Exception as exc:  # pydantic ValidationError
                raise ApiError(
                    "'materials' failed validation against the study-materials schema.",
                    code="invalid_materials",
                    details=[str(exc).splitlines()[0]] if str(exc) else None,
                ) from exc
            raw_items = verification.flatten_materials(materials.model_dump(mode="json"))

        if not isinstance(raw_items, list) or not raw_items:
            raise ApiError(
                "Provide a non-empty 'items' list (or a 'materials' object) to verify.",
                code="invalid_input",
            )
        if len(raw_items) > MAX_VERIFY_ITEMS:
            raise ApiError(
                f"Too many items to verify in one request (limit {MAX_VERIFY_ITEMS}).",
                status=413,
                code="too_many_items",
            )
        try:
            items = [VerifyItem.model_validate(entry) for entry in raw_items]
        except Exception as exc:  # pydantic ValidationError
            raise ApiError(
                "One or more items are malformed.", code="invalid_items",
                details=[str(exc).splitlines()[0]] if str(exc) else None,
            ) from exc

        return jsonify(verification.verify_items(source, items, segments))

    # ------------------------------------------------------------- error paths
    @app.errorhandler(ApiError)
    def handle_api_error(error: ApiError):
        return jsonify(_error_payload(error.message, error.code, error.details)), error.status

    @app.errorhandler(ExtractionError)
    def handle_extraction_error(error: ExtractionError):
        return jsonify(_error_payload(error.message, error.code)), error.status

    @app.errorhandler(generation.GenerationError)
    def handle_generation_error(error: generation.GenerationError):
        return jsonify(_error_payload(error.message, error.code, error.details)), error.status

    @app.errorhandler(413)
    def handle_too_large(_error):
        return jsonify(_error_payload(
            "The upload is larger than the configured size limit.",
            "file_too_large",
        )), 413

    @app.errorhandler(404)
    def handle_not_found(_error):
        return jsonify(_error_payload(f"Unknown endpoint: {request.path}", "not_found")), 404

    @app.errorhandler(405)
    def handle_method_not_allowed(error):
        return jsonify(_error_payload(
            f"Method {request.method} is not allowed for {request.path}.", "method_not_allowed"
        )), 405

    @app.errorhandler(Exception)
    def handle_unexpected(error: Exception):
        if isinstance(error, HTTPException):
            return jsonify(_error_payload(error.description or str(error), "http_error")), error.code
        logger.exception("Unhandled error while handling %s", request.path)
        return jsonify(_error_payload(
            "The server encountered an unexpected error.", "internal_error"
        )), 500

    return app


app = create_app()

if __name__ == "__main__":  # pragma: no cover
    logging.basicConfig(level=logging.INFO)
    port = int(os.environ.get("PORT", "5001"))
    debug = os.environ.get("FLASK_DEBUG", "").lower() in {"1", "true", "yes"}
    app.run(host="0.0.0.0", port=port, debug=debug)
