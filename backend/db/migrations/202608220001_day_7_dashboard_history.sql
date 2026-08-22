-- Day 7: deterministic owner-scoped dashboard and cursor-paginated history queries.
CREATE INDEX IF NOT EXISTS idx_skin_analysis_user_created_id
    ON public.skin_analysis (user_id, created_at DESC, id DESC);
