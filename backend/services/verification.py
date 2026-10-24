"""Claim-level evidence verification, kept separate from generation.

Two independent checks run for every generated item:

1. **Quotation check** - the exact evidence quotation must be locatable in the
   extracted source text (whitespace-normalised, typographic quotes folded).
   The segment where it was found is reported, and the claimed location is
   compared with the real one.
2. **Claim-to-evidence check** - a lexical overlap measure between the claim and
   the quotations that support it. A quotation that exists in the source does
   *not* prove the claim is entailed by it, so this step deliberately stays
   conservative: uncertain results are flagged for human review rather than
   upgraded to SUPPORTED.

Verification never raises a grounding status; it can only keep the status the
model reported or downgrade it.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional, Sequence, Tuple

from backend.schemas import VerifyItem

_RANK = {"UNSUPPORTED": 0, "PARTIALLY_SUPPORTED": 1, "SUPPORTED": 2}

DISCLAIMER = (
    "Automated verification checks that quotations exist in the source and that the claim wording "
    "overlaps its evidence. It does not prove semantic correctness or factual accuracy; every item "
    "must be checked by a human before academic use."
)

_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "from",
    "by", "is", "are", "was", "were", "be", "been", "being", "it", "its", "this", "that",
    "these", "those", "as", "if", "then", "than", "there", "here", "they", "them", "their",
    "we", "our", "you", "your", "he", "she", "his", "her", "not", "no", "do", "does", "did",
    "can", "may", "will", "would", "should", "must", "could", "when", "what", "which", "who",
    "whom", "how", "why", "where", "each", "every", "all", "any", "some", "more", "most",
    "other", "into", "over", "under", "between", "such", "only", "also", "using", "used",
    "use", "e.g", "i.e", "via", "per", "one", "two", "three", "four", "five",
}

_TYPOGRAPHIC = {
    "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
    "\u00a0": " ", "\u200b": "", "\ufeff": "",
}


def normalize(text: str) -> str:
    """Whitespace-normalise a string without altering its wording."""
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    for source, target in _TYPOGRAPHIC.items():
        text = text.replace(source, target)
    return re.sub(r"\s+", " ", text).strip()


def _match_type(haystack: str, needle: str) -> Optional[str]:
    """Return 'exact', 'case_insensitive' or None."""
    if not needle:
        return None
    if needle in haystack:
        return "exact"
    if needle.lower() in haystack.lower():
        return "case_insensitive"
    return None


def _locate(
    quote: str, segments: Sequence[Tuple[Optional[str], str]]
) -> Tuple[Optional[str], Optional[str]]:
    """Locate a quotation. Returns (match_type, actual_location)."""
    needle = normalize(quote)
    if not needle:
        return None, None
    for location, text in segments:
        match = _match_type(text, needle)
        if match:
            return match, location
    combined = " ".join(text for _, text in segments)
    match = _match_type(combined, needle)
    if match:
        return match, None
    return None, None


def _locations_match(claimed: Optional[str], actual: Optional[str]) -> Optional[bool]:
    if claimed is None or actual is None:
        return None
    return normalize(claimed).lower() == normalize(actual).lower()


def _stem(token: str) -> str:
    """Very light suffix stripping so paraphrases still overlap (heuristic only)."""
    if token.endswith("ies") and len(token) > 4:
        return token[:-3] + "y"
    if token.endswith("ses") and len(token) > 4:
        return token[:-2]
    if token.endswith("ing") and len(token) > 5:
        return token[:-3]
    if token.endswith("ed") and len(token) > 4:
        return token[:-2]
    if token.endswith("es") and len(token) > 4:
        return token[:-2]
    if token.endswith("s") and not token.endswith("ss") and len(token) > 3:
        return token[:-1]
    return token


def _content_tokens(text: str) -> List[str]:
    raw = re.findall(r"[A-Za-z0-9][A-Za-z0-9'%\-.]*", (text or "").lower())
    tokens = []
    for token in raw:
        token = token.strip(".-")
        if len(token) < 3 or token in _STOPWORDS:
            continue
        tokens.append(_stem(token))
    return tokens


def claim_check(claim: str, evidence_quotes: Sequence[str]) -> Dict[str, Any]:
    """Lexical claim-to-evidence check. Deliberately conservative."""
    if not evidence_quotes:
        return {
            "status": "no_evidence",
            "overlap": 0.0,
            "missing_values": [],
            "matched_terms": 0,
            "total_terms": len(_content_tokens(claim)),
        }

    evidence_norm = " ".join(normalize(quote) for quote in evidence_quotes)
    claim_norm = normalize(claim)
    numbers = re.findall(r"\d+(?:[.,]\d+)*%?", claim_norm)
    missing_values = [value for value in numbers if value not in evidence_norm]

    claim_tokens = _content_tokens(claim_norm)
    evidence_tokens = set(_content_tokens(evidence_norm))
    if not claim_tokens:
        return {
            "status": "no_terms",
            "overlap": 1.0,
            "missing_values": missing_values,
            "matched_terms": 0,
            "total_terms": 0,
        }

    matched = sum(1 for token in claim_tokens if token in evidence_tokens)
    overlap = round(matched / len(claim_tokens), 3)

    if missing_values:
        status = "values_not_in_evidence"
    elif claim_norm and claim_norm in evidence_norm:
        status = "strong"
    elif overlap >= 0.7:
        status = "strong"
    elif overlap >= 0.4:
        status = "uncertain"
    else:
        status = "weak"

    return {
        "status": status,
        "overlap": overlap,
        "missing_values": missing_values,
        "matched_terms": matched,
        "total_terms": len(claim_tokens),
    }


def _downgrade(grounding: str, cap: str) -> str:
    if _RANK.get(cap, 2) < _RANK.get(grounding, 2):
        return cap
    return grounding


def verify_items(
    source_text: str,
    items: Sequence[VerifyItem | Dict[str, Any]],
    segments: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Verify evidence quotations and claim/evidence alignment for each item."""
    if segments is None or not segments:
        segments = [{"location": None, "text": source_text or ""}]
    norm_segments: List[Tuple[Optional[str], str]] = [
        (segment.get("location"), normalize(segment.get("text") or "")) for segment in segments
    ]

    results: List[Dict[str, Any]] = []
    for raw in items:
        item = raw if isinstance(raw, VerifyItem) else VerifyItem.model_validate(raw)
        reasons: List[str] = []
        cap = "SUPPORTED"
        evidence_results: List[Dict[str, Any]] = []
        found_quotes: List[str] = []

        if not item.evidence:
            reasons.append("No supporting quotation was provided for this claim.")
            cap = "PARTIALLY_SUPPORTED"

        for ev in item.evidence:
            match_type, actual_location = _locate(ev.quote, norm_segments)
            found = match_type is not None
            location_match = _locations_match(ev.location, actual_location)
            if found:
                found_quotes.append(normalize(ev.quote))
                if match_type == "case_insensitive":
                    reasons.append(
                        "An evidence quotation matched the source only after case-insensitive "
                        "comparison and should be checked by a human."
                    )
                    cap = _downgrade(cap, "PARTIALLY_SUPPORTED")
            else:
                reasons.append(
                    'Evidence quotation could not be located in the source: "' + normalize(ev.quote)[:120]
                    + ('...".' if len(normalize(ev.quote)) > 120 else '".')
                )
                cap = _downgrade(cap, "PARTIALLY_SUPPORTED")
            if location_match is False:
                reasons.append(
                    f'Claimed location "{ev.location}" does not match the location where the '
                    f'quotation was found ("{actual_location}").'
                )
                cap = _downgrade(cap, "PARTIALLY_SUPPORTED")

            evidence_results.append(
                {
                    "quote": ev.quote,
                    "claimed_location": ev.location,
                    "actual_location": actual_location,
                    "found": found,
                    "match_type": match_type,
                    "location_match": location_match,
                }
            )

        check = claim_check(item.content, found_quotes)
        if check["status"] in {"values_not_in_evidence"}:
            reasons.append(
                "The claim contains a number or value that does not appear in its evidence "
                f"quotation(s): {', '.join(check['missing_values'])}."
            )
        elif check["status"] in {"uncertain", "weak", "no_evidence", "no_terms"}:
            reasons.append(
                "The automated claim-to-evidence check found only limited overlap between the "
                f"claim and its quotation(s) (overlap {check['overlap']:.0%}); entailment must be "
                "judged by a human."
            )
            # Flag only: lexical overlap is a screening signal, never proof, so an uncertain
            # claim is escalated for review rather than silently reclassified here.

        if item.warning:
            reasons.append(f"Reported by the generator: {item.warning}")
        if item.grounding != "SUPPORTED":
            reasons.append(f"Generator reported grounding status: {item.grounding}.")

        verified_grounding = _downgrade(item.grounding, cap)
        reasons = list(dict.fromkeys(reasons))  # preserve order, drop duplicates

        results.append(
            {
                "item_type": item.item_type,
                "content": item.content,
                "reported_grounding": item.grounding,
                "verified_grounding": verified_grounding,
                "needs_review": bool(reasons),
                "reasons": reasons,
                "claim_check": check,
                "evidence": evidence_results,
            }
        )

    counts = {
        "SUPPORTED": 0,
        "PARTIALLY_SUPPORTED": 0,
        "UNSUPPORTED": 0,
    }
    quotes_found = 0
    quotes_total = 0
    for result in results:
        counts[result["verified_grounding"]] = counts.get(result["verified_grounding"], 0) + 1
        for ev in result["evidence"]:
            quotes_total += 1
            if ev["found"]:
                quotes_found += 1

    return {
        "items": results,
        "summary": {
            "total": len(results),
            "supported": counts["SUPPORTED"],
            "partially_supported": counts["PARTIALLY_SUPPORTED"],
            "unsupported": counts["UNSUPPORTED"],
            "quotes_total": quotes_total,
            "quotes_located": quotes_found,
            "quotes_missing": quotes_total - quotes_found,
            "needs_review": sum(1 for result in results if result["needs_review"]),
        },
        "all_quotes_located": quotes_total > 0 and quotes_found == quotes_total,
        "verification_level": "mechanical",
        "disclaimer": DISCLAIMER,
    }


def flatten_materials(materials: Dict[str, Any]) -> List[VerifyItem]:
    """Turn generated study materials into a flat list of verifiable claims."""
    items: List[VerifyItem] = []

    for point in materials.get("summary", []) or []:
        items.append(
            VerifyItem(
                item_type="summary",
                content=point.get("point", ""),
                evidence=point.get("evidence", []) or [],
                grounding=point.get("grounding", "SUPPORTED"),
                warning=point.get("warning"),
            )
        )

    for entry in materials.get("glossary", []) or []:
        definition = entry.get("definition")
        content = (
            f"{entry.get('term', '')}: {definition}"
            if definition
            else f"{entry.get('term', '')}: Not supported by source"
        )
        items.append(
            VerifyItem(
                item_type="glossary",
                content=content,
                evidence=entry.get("evidence", []) or [],
                grounding=entry.get("grounding", "SUPPORTED"),
                warning=entry.get("warning"),
            )
        )

    for question in materials.get("questions", []) or []:
        items.append(
            VerifyItem(
                item_type="question",
                content=question.get("question", ""),
                evidence=question.get("evidence", []) or [],
                grounding=question.get("grounding", "SUPPORTED"),
                warning=question.get("warning"),
            )
        )
        answer = question.get("answer")
        items.append(
            VerifyItem(
                item_type="answer",
                content=answer if answer else "No supported answer could be given from the notes.",
                evidence=question.get("answer_evidence", []) or [],
                grounding=question.get("answer_grounding", "SUPPORTED"),
                warning=question.get("warning") if not answer else None,
            )
        )

    return items
