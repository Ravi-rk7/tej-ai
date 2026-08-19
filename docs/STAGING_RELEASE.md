# Staging release record

Status: **Not deployed**

This record must contain no credentials, tokens, emails, or provider payloads.

| Field                      | Value                               |
| -------------------------- | ----------------------------------- |
| Frontend URL               | Pending                             |
| Backend URL                | Pending                             |
| Supabase project reference | Pending (non-secret reference only) |
| Migration version          | `202608180001`                      |
| Release commit             | Pending                             |
| Rollback commit            | `710d027`                           |
| Deployed at (UTC)          | Pending                             |

## Verification

- [ ] Backend `GET /api/health` returns HTTP 200.
- [ ] Frontend loads over HTTPS without mixed content.
- [ ] Missing bearer token returns HTTP 401 on a protected endpoint.
- [ ] Unconfigured Origin is rejected by CORS.
- [ ] Supabase tables and RLS match migration `202608180001`.
- [ ] Two staging users cannot read each other's records.
- [ ] Browser user cannot insert scans or mutate subscriptions.
- [ ] Build output and logs contain no secrets.
