# Scan result contract (v1)

The authenticated `POST /api/scan` and `GET /api/results/:scanId` endpoints
return the same `{ success: true, data }` shape. The GET endpoint is owner
scoped and never returns image fields, raw provider responses, user IDs, or
provider request identifiers.

```json
{
  "schemaVersion": 1,
  "scanId": "uuid",
  "createdAt": "ISO timestamp",
  "glowScore": 0,
  "skinType": "Combination",
  "concerns": ["Pigmentation"],
  "concernDetails": [
    { "key": "pigmentation", "label": "Pigmentation", "score": 68, "severity": "moderate" }
  ],
  "metrics": {
    "schemaVersion": 1,
    "totalScore": 0,
    "healthScores": {},
    "concernDetails": [],
    "qualityWarnings": []
  },
  "routine": {
    "schemaVersion": 1,
    "source": "openai",
    "morning": [{ "name": "Gentle cleanser", "instructions": "..." }],
    "night": [{ "name": "Gentle cleanser", "instructions": "..." }],
    "safety": {
      "patchTest": "...",
      "spf": "...",
      "cautions": "...",
      "disclaimer": "...",
      "dermatologist": null
    }
  },
  "warnings": [
    { "code": "FACE_SIZE_BELOW_RECOMMENDATION", "message": "..." }
  ],
  "imageGuidance": "A closer, front-facing photo may improve scan accuracy."
}
```

`concerns` remains a string-label compatibility field. New rows contain
structured `concernDetails`; legacy rows may contain null scores or severity.
Legacy string routines and flat arrays are normalized with deterministic safety
notices. Missing or invalid scores are unavailable results, never zero.

Result lookup applies both `id = :scanId` and `user_id = authenticated user`
because the server uses a Supabase service-role client. Valid missing and
foreign IDs return the same `404 RESULT_NOT_FOUND` response. Malformed IDs
return `400 RESULT_ID_INVALID`. Successful and error responses are marked
`Cache-Control: private, no-store`.

Quality warnings persist only sanitized codes and messages in the existing
`metrics` JSONB field. Raw image-quality/provider payloads are not persisted.
