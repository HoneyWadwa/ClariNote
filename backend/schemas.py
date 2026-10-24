"""Pydantic schemas for structured AI output and verification payloads.

Every field of the AI-facing models is required (optional values are declared
explicitly as nullable and without defaults) so the schema can be passed
directly to the OpenAI strict structured-output mode.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

GroundingStatus = Literal["SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED"]

GROUNDING_VALUES = ("SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED")


class Evidence(BaseModel):
    """A supporting quotation copied verbatim from the lecture notes."""

    quote: str = Field(description="Exact quotation copied verbatim from the lecture notes.")
    location: Optional[str] = Field(
        description='Page or section marker (e.g. "Page 2", "Section: Intro") or null if unavailable.'
    )


class SummaryPoint(BaseModel):
    point: str = Field(description="One concise summary bullet derived only from the notes.")
    evidence: List[Evidence] = Field(description="Quotations supporting this bullet.")
    grounding: GroundingStatus = Field(description="SUPPORTED, PARTIALLY_SUPPORTED or UNSUPPORTED.")
    warning: Optional[str] = Field(
        description="Why the point is not fully supported; null when fully supported."
    )


class GlossaryEntry(BaseModel):
    term: str = Field(description="Important technical or subject-specific term from the notes.")
    definition: Optional[str] = Field(
        description="Concise definition supported by the notes, or null when the notes do not define it."
    )
    evidence: List[Evidence] = Field(description="Quotation supporting the definition.")
    grounding: GroundingStatus = Field(description="SUPPORTED, PARTIALLY_SUPPORTED or UNSUPPORTED.")
    warning: Optional[str] = Field(
        description='Why the definition is unsupported, e.g. "Not supported by source"; null otherwise.'
    )


class Question(BaseModel):
    number: int = Field(description="Question number, 1 to 5.")
    question_type: Literal["recall", "conceptual", "application"]
    question: str = Field(description="The practice question.")
    evidence: List[Evidence] = Field(description="Quotations showing the question is answerable from the notes.")
    grounding: GroundingStatus = Field(description="Grounding status of the question itself.")
    answer: Optional[str] = Field(description="Correct answer from the notes, or null if not supported.")
    answer_evidence: List[Evidence] = Field(description="Quotations supporting the answer.")
    answer_grounding: GroundingStatus = Field(description="Grounding status of the answer.")
    warning: Optional[str] = Field(
        description="Explanation when the question or answer is not fully supported; null otherwise."
    )


class StudyMaterials(BaseModel):
    """Top-level structured output requested from the model."""

    summary: List[SummaryPoint]
    glossary: List[GlossaryEntry]
    questions: List[Question]


# ---------------------------------------------------------------------------
# Internal (not sent to the model) verification payload schemas
# ---------------------------------------------------------------------------


class VerifyEvidence(BaseModel):
    quote: str
    location: Optional[str] = None


class VerifyItem(BaseModel):
    item_type: str = "claim"
    content: str
    evidence: List[VerifyEvidence] = []
    grounding: GroundingStatus = "SUPPORTED"
    warning: Optional[str] = None
