# Hallucination prevention: methods and limitations

LectureLens treats the uploaded lecture notes as the **sole factual authority**. This document
explains what the application actually does to keep generated material grounded, and — just as
importantly — what it cannot do.

## 1. Design principle

> The source never has to be defended; the *claims about the source* do.

Nothing in the pipeline adds external knowledge. The system prompt tells the model:

> "You are a careful educational assistant. Use only the lecture notes supplied by the user. Do not
> rely on outside knowledge. Preserve the source's meaning, terminology, qualifications, numerical
> values, and relationships. Every factual output item must include an exact supporting quotation
> from the source and a source location when available. If the source does not support a statement,
> mark it UNSUPPORTED and explain why. Do not invent citations, quotations, definitions, facts, or
> answers."

## 2. Methods implemented

### 2.1 Constrained generation (backend/services/generation.py)

- Structured output via the OpenAI **strict JSON-schema mode**, validated by **Pydantic**
  (`backend/schemas.py`). A response that fails validation is rejected — never partially accepted.
- The user message repeats the hard rules: **EXACTLY 5 questions**, quotations copied **VERBATIM**,
  `null` instead of invented definitions, and `grounding` restricted to the three allowed values.
- Question count is checked after validation. A wrong count triggers **one corrective retry**; a
  second failure returns `502 question_count` instead of silently shipping 4 questions as 5.
- Source text is sent with explicit **location markers** (`[Page 2]`, `[Section: Heading]`) so
  citations can be checked against real positions rather than plausible-sounding page numbers.

### 2.2 Claim-level verification, separate from generation (backend/services/verification.py)

Generation and verification are different passes. The verifier re-reads the original extracted text
and performs two independent checks per item:

1. **Quotation check**
   - whitespace is normalised (NFC, typographic quotes folded, runs of whitespace collapsed) —
     wording is never altered;
   - exact match first, then case-insensitive match (which is reported as a weaker result and still
     flagged for review);
   - the **segment where the quote was found** is returned and compared with the location the model
     claimed; a mismatch is flagged;
   - a quotation that cannot be located marks the whole item `needs_review` and **downgrades** its
     status — the citation is treated as invalid.

2. **Claim-to-evidence check**
   - a matching quotation is **not** treated as proof of entailment;
   - the claim is compared with its supporting quotations for lexical overlap, and any number or
     value in the claim must appear in the evidence (`values_not_in_evidence` otherwise);
   - weak or uncertain overlap adds a human-readable reason and sets `needs_review`.

### 2.3 Asymmetric status updates

Verification may only **keep or lower** a grounding status:

| Reported | Quote located + strong overlap | Quote missing / mismatched |
| -------- | ------------------------------ | -------------------------- |
| `SUPPORTED` | `SUPPORTED` | `PARTIALLY_SUPPORTED` + review flag |
| `PARTIALLY_SUPPORTED` | `PARTIALLY_SUPPORTED` | `PARTIALLY_SUPPORTED` |
| `UNSUPPORTED` | `UNSUPPORTED` | `UNSUPPORTED` |

There is no code path that converts an unsupported claim into a supported one.

### 2.4 Explicit unsupported handling

- Glossary definitions that the notes do not establish are returned as `null` with
  `grounding: UNSUPPORTED` and a warning; the UI renders **“Not supported by source”** rather than
  filling the gap.
- Answers that the source cannot support are flagged in the same way and shown with a
  *Needs human review* block listing every reason.
- `/api/generate` and `/api/verify` both return a `summary` (supported / partial / unsupported,
  quotes located vs missing, items needing review) and the disclaimer:

  > "Automated verification checks that quotations exist in the source and that the claim wording
  > overlaps its evidence. It does not prove semantic correctness or factual accuracy; every item
  > must be checked by a human before academic use."

### 2.5 Honest failure modes instead of fabricated success

- **No API key** → `mode: "demo"` with a fixed, hand-checked sample and an explicit notice that it
  was *not* generated from the user's input. `/api/health` reports `live_ai_configured: false` and
  the UI shows a persistent badge.
- **API failures** → structured errors: `missing_api_key` (503), `rate_limit` (429), `auth_error`
  (503), `api_unavailable` / `api_error` (502), `invalid_response` (502). No demo data is ever
  returned under a "live" label.
- **The UI never presents demo output as live**: the results panel carries a coloured banner that
  names the mode and the model.

### 2.6 Input hygiene

- Size and length limits (`MAX_FILE_MB`, `MAX_TEXT_LENGTH`) are enforced **server-side**; empty,
  malformed, encrypted or image-only documents are rejected with specific error codes rather than
  silently producing garbage.
- Uploads are processed in memory and never stored.

## 3. Limitations — read before relying on the output

1. **Mechanical ≠ semantic.** The verifier proves *presence*, not *truth*. A quotation can exist
   and still be a poor support for the claim; lexical overlap only screens for the most obvious
   mismatches. Human judgement remains essential.
2. **Heuristic thresholds.** The overlap score uses light stemming and a stopword list. Paraphrases
   can be flagged as `uncertain` (over-flagging), and a fluent but wrong paraphrase could still
   score high (under-flagging). The result is advisory, never a certificate.
3. **No independent fact-checking.** If the source itself is wrong, the output will faithfully
   reproduce the error — by design, because the source is the authority.
4. **The model can misquote.** Verbatim quotation is requested and enforced by the verifier, but the
   fix for a failed quote is a review flag, not automatic repair; a stricter model reduces but does
   not eliminate these flags.
5. **Location markers are best-effort.** TXT and pasted text carry no natural page numbers, so
   locations may be `null`; a missing location is not an error.
6. **One corrective retry only.** Repeated model misbehaviour surfaces as a 502 error rather than
   an automatic multi-round debate between model calls.
7. **Automated verification reduces risk; it does not guarantee factual accuracy.** Every generated
   item is intended to be reviewed by a human (section D of the UI) before any academic use.
