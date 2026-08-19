# AILabTools provider contract

TejAi integrates with AILabTools Skin Analyze Pro API v1.7.1. The adapter is
implemented in `backend/services/skinAnalysisService.js` and sends only a
normalized, transient JPEG in the documented multipart field named `image`.

Primary references:

- [Skin Analyze Pro API v1.7.1](https://www.ailabtools.com/docs/ai-portrait/analysis/skin-analysis-pro/api-v171)
- [Public response fields and error codes](https://www.ailabtools.com/docs/response-description)
- [Degree and score reference](https://www.ailabtools.com/docs/ai-portrait/analysis/skin-analysis-pro/degree-score)

## Request contract

- Method: `POST`
- Endpoint: `https://www.ailabapi.com/api/portrait/analysis/skin-analysis-pro`
- Authentication header: `ailabapi-api-key`
- Content type: `multipart/form-data`
- File field: `image`, fixed filename `scan.jpg`, content type `image/jpeg`
- Local boundary: non-empty, valid JPEG, no more than 8 MB, normalized to at
  most 4096x4096 pixels before the provider request
- Provider timeout: 8 seconds

No URLs, original filenames, side images, face maps, or image-retention fields
are sent.

## Response contract

A successful current response must have HTTP 200 and match the checked schema:

- `request_id`, `log_id`, and an empty `error_detail.code`
- `result.skin_type.skin_type`: `0` Oily, `1` Dry, `2` Neutral, or
  `3` Combination
- all documented `result.score_info` total scores in the range 0-100
- optional structured image-quality, acne, pigmentation, roughness, and
  sensitivity fields when returned

Provider scores are health scores: a higher score is healthier. The adapter
preserves the complete named scores in `scoreInfo`. It also keeps the existing
application `metrics` shape as issue severity (`100 - provider score`) until
the Day 5 score and concern module consumes `scoreInfo` directly.

Synthetic fixtures derived from the documented field definitions are kept in
`backend/test/fixtures/ailabtools`. They contain no real provider IDs, images,
or user data.

## Failure behavior

- Face and photo quality errors return HTTP 422 with specific retake guidance.
- Network errors, timeouts, and 5xx responses receive at most one retry.
- Authentication and rate-limit failures are not blindly retried.
- Five consecutive unavailable operations open the circuit for 30 seconds; a
  single half-open probe determines recovery.
- Malformed success bodies return the stable
  `SKIN_PROVIDER_INVALID_RESPONSE` error and never expose schema internals.
- Provider telemetry contains operation, outcome, attempt, latency, category,
  and provider error code only. It excludes image bytes, user identifiers,
  provider request IDs, API keys, and response payloads.
- Analysis failure exits before score generation, routine generation, or scan
  persistence.

## Consented staging verification

Place at least 15 explicitly consented JPG/JPEG portraits in an untracked
directory. Then run from `backend`:

```powershell
npm run test:provider -- C:\path\to\consented-images
```

The verifier processes files in memory, clears both source and normalized
buffers, and reports only sequential scan numbers and aggregate categories. It
does not print filenames or provider payloads. The gate passes only when every
image either succeeds or returns the expected meaningful image-quality error.
