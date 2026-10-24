"""Document extraction for TXT, PDF and DOCX inputs.

Files are processed in memory only; nothing is written to disk.
Each extraction returns ordered *segments* so page/section information is kept
alongside the text.
"""

from __future__ import annotations

import io
import zipfile
from typing import Any, Dict, List

from backend.config import Config

ALLOWED_EXTENSIONS = ("txt", "pdf", "docx")


class ExtractionError(Exception):
    """Raised for invalid, oversized, empty or unreadable input."""

    def __init__(self, message: str, *, status: int = 400, code: str = "invalid_input"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def _segment(location: str | None, text: str) -> Dict[str, Any]:
    return {"location": location, "text": text}


def _build_payload(
    *,
    filename: str | None,
    file_type: str,
    size_bytes: int | None,
    segments: List[Dict[str, Any]],
    extra: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    text = "\n\n".join(seg["text"].strip() for seg in segments if seg["text"].strip())
    payload: Dict[str, Any] = {
        "filename": filename,
        "file_type": file_type,
        "size_bytes": size_bytes,
        "char_count": len(text),
        "line_count": text.count("\n") + 1 if text else 0,
        "locations": [seg["location"] for seg in segments if seg["location"]],
        "segments": segments,
        "text": text,
    }
    if extra:
        payload.update(extra)
    return payload


def build_marked_source(segments: List[Dict[str, Any]]) -> str:
    """Prefix each segment with its [location] marker for the AI prompt."""
    parts: List[str] = []
    for seg in segments:
        body = (seg.get("text") or "").strip()
        if not body:
            continue
        location = seg.get("location")
        parts.append(f"[{location}]\n{body}" if location else body)
    return "\n\n".join(parts)


def validate_text(text: str, config: Config) -> str:
    if not isinstance(text, str) or not text.strip():
        raise ExtractionError("No text was provided. Paste lecture notes or upload a file.")
    if len(text) > config.max_text_length:
        raise ExtractionError(
            f"Text is too long ({len(text):,} characters). "
            f"The limit is {config.max_text_length:,} characters; split the notes into parts.",
            status=413,
            code="text_too_long",
        )
    return text


def extract_text(text: str, config: Config) -> Dict[str, Any]:
    """Normalise pasted/plain text into the standard extraction payload."""
    clean = validate_text(text, config)
    return _build_payload(
        filename=None,
        file_type="text",
        size_bytes=len(clean.encode("utf-8")),
        segments=[_segment("Input text", clean)],
        extra={"encoding": "utf-8"},
    )


def extract_uploaded(file_storage: Any, config: Config) -> Dict[str, Any]:
    """Extract text from an uploaded file-like object (Flask FileStorage or any stream)."""
    filename = getattr(file_storage, "filename", None) or ""
    if not filename.strip():
        raise ExtractionError("No file was provided.")

    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in ALLOWED_EXTENSIONS:
        raise ExtractionError(
            f"Unsupported file type '{extension or 'unknown'}'. Allowed types: "
            f"{', '.join(ALLOWED_EXTENSIONS).upper()}.",
            code="unsupported_file_type",
        )

    data = file_storage.read()
    if hasattr(file_storage, "seek"):
        try:
            file_storage.seek(0)
        except Exception:  # pragma: no cover - stream without seek support
            pass

    if not data:
        raise ExtractionError("The file is empty.", code="empty_file")
    if len(data) > config.max_file_bytes:
        raise ExtractionError(
            f"File is too large ({len(data) / (1024 * 1024):.1f} MB). "
            f"The limit is {config.max_file_mb} MB.",
            status=413,
            code="file_too_large",
        )

    if extension == "txt":
        return _extract_txt(filename, data)
    if extension == "pdf":
        return _extract_pdf(filename, data)
    return _extract_docx(filename, data)


def _extract_txt(filename: str, data: bytes) -> Dict[str, Any]:
    encoding = "utf-8"
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        encoding = "latin-1"
        text = data.decode("latin-1", errors="replace")
    if not text.strip():
        raise ExtractionError("The text file is empty.", code="empty_file")
    return _build_payload(
        filename=filename,
        file_type="txt",
        size_bytes=len(data),
        segments=[_segment("Input text", text)],
        extra={"encoding": encoding},
    )


def _extract_pdf(filename: str, data: bytes) -> Dict[str, Any]:
    try:
        try:
            import pymupdf as fitz  # PyMuPDF >= 1.24
        except ImportError:  # pragma: no cover - older PyMuPDF
            import fitz
    except ImportError as exc:  # pragma: no cover - dependency problem
        raise ExtractionError(
            "PDF support is unavailable: PyMuPDF is not installed.", status=500, code="dependency_missing"
        ) from exc

    try:
        document = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise ExtractionError(
            "The PDF could not be read. It may be corrupted or password protected.",
            code="malformed_document",
        ) from exc

    try:
        if getattr(document, "is_encrypted", False):
            raise ExtractionError(
                "The PDF is password protected and cannot be read.",
                code="malformed_document",
            )
        segments: List[Dict[str, Any]] = []
        for index, page in enumerate(document, start=1):
            page_text = page.get_text("text") or ""
            if page_text.strip():
                segments.append(_segment(f"Page {index}", page_text))
    finally:
        document.close()

    if not segments:
        raise ExtractionError(
            "No extractable text was found in the PDF. It may be a scanned image "
            "(OCR is not part of this tool).",
            code="no_text_found",
        )
    return _build_payload(
        filename=filename, file_type="pdf", size_bytes=len(data), segments=segments
    )


def _extract_docx(filename: str, data: bytes) -> Dict[str, Any]:
    try:
        import docx  # python-docx
    except ImportError as exc:  # pragma: no cover - dependency problem
        raise ExtractionError(
            "DOCX support is unavailable: python-docx is not installed.",
            status=500,
            code="dependency_missing",
        ) from exc

    if not zipfile.is_zipfile(io.BytesIO(data)):
        raise ExtractionError(
            "The DOCX file is malformed or is not a Word document.",
            code="malformed_document",
        )

    try:
        document = docx.Document(io.BytesIO(data))
    except Exception as exc:
        raise ExtractionError(
            "The DOCX file could not be opened. It may be corrupted.",
            code="malformed_document",
        ) from exc

    segments: List[Dict[str, Any]] = []
    current_location: str | None = None
    buffer: List[str] = []

    def flush() -> None:
        nonlocal buffer
        body = "\n".join(buffer).strip()
        if body:
            segments.append(_segment(current_location, body))
        buffer = []

    paragraphs = list(document.paragraphs)
    try:
        inner = list(document.iter_inner_content())  # python-docx >= 1.1 (keeps tables in order)
    except AttributeError:  # pragma: no cover - older python-docx
        inner = paragraphs

    for block in inner:
        block_text = getattr(block, "text", "") or ""
        style_name = ""
        style = getattr(block, "style", None)
        if style is not None:
            style_name = (getattr(style, "name", "") or "").strip()

        is_heading = style_name.lower().startswith("heading") and block_text.strip()
        if is_heading:
            flush()
            current_location = f"Section: {block_text.strip()}"
            # Heading text is also part of the section content.
            buffer.append(block_text.strip())
            continue
        if block_text.strip():
            buffer.append(block_text.strip())

    flush()

    # Some .docx files only contain tables.
    if not segments:
        for table in document.tables:
            rows = []
            for row in table.rows:
                rows.append(" | ".join(cell.text.strip() for cell in row.cells))
            if any(cell.strip() for cell in rows):
                segments.append(_segment("Table", "\n".join(rows)))

    if not segments:
        raise ExtractionError(
            "No extractable text was found in the document.", code="no_text_found"
        )

    return _build_payload(
        filename=filename, file_type="docx", size_bytes=len(data), segments=segments
    )
