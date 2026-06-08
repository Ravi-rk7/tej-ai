# TejAi - Database Setup

## How to apply the schema

1. Open your Supabase project at supabase.com
2. Go to SQL Editor in the left sidebar
3. Click "New query"
4. Copy the entire contents of `schema.sql`
5. Paste into the editor and click "Run"
6. Verify in Table Editor that `skin_analysis` and `subscriptions` tables appear

## Verify RLS is enabled

In Table Editor, select `skin_analysis`, then click the "Policies" tab.
You should see the scan policies listed. Repeat for `subscriptions`.

## After running schema

The backend uses the `SERVICE_ROLE_KEY` to bypass RLS when writing scan results
and updating subscriptions server-side. Make sure `SUPABASE_SERVICE_ROLE_KEY`
is set in `backend/.env`. Never expose this key in the frontend.
