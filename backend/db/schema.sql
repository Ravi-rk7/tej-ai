-- TejAi initial production schema
-- Apply once to a new Supabase project through the SQL editor or migration tooling.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.skin_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    image_url TEXT,
    cloudinary_public_id TEXT,
    image_retained BOOLEAN NOT NULL DEFAULT FALSE,
    glow_score INTEGER NOT NULL CHECK (glow_score BETWEEN 0 AND 100),
    skin_type TEXT,
    concerns JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(concerns) = 'array'),
    routine JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(routine) = 'object'),
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metrics) = 'object'),
    raw_api_response JSONB,
    provider TEXT NOT NULL DEFAULT 'ailabtools',
    provider_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free'
        CHECK (plan IN ('free', 'starter', 'growth', 'pro')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'cancelled', 'past_due', 'pending', 'on_hold', 'expired')),
    dodo_customer_id TEXT,
    dodo_subscription_id TEXT UNIQUE,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'dodo',
    provider_event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skin_analysis_user_created
    ON public.skin_analysis (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skin_analysis_user_created_id
    ON public.skin_analysis (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_period_end
    ON public.subscriptions (status, current_period_end);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_created
    ON public.payment_webhook_events (created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_free_subscription_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.subscriptions (user_id, plan, status)
    VALUES (NEW.id, 'free', 'active')
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_free_subscription_after_signup ON auth.users;
CREATE TRIGGER create_free_subscription_after_signup
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.create_free_subscription_for_new_user();

REVOKE EXECUTE ON FUNCTION public.create_free_subscription_for_new_user()
    FROM PUBLIC, anon, authenticated;

-- Backfill users created before the entitlement trigger existed.
INSERT INTO public.subscriptions (user_id, plan, status)
SELECT users.id, 'free', 'active'
FROM auth.users AS users
LEFT JOIN public.subscriptions AS subscriptions
    ON subscriptions.user_id = users.id
WHERE subscriptions.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

DROP TRIGGER IF EXISTS set_skin_analysis_updated_at ON public.skin_analysis;
CREATE TRIGGER set_skin_analysis_updated_at
    BEFORE UPDATE ON public.skin_analysis
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER set_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.skin_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own scans" ON public.skin_analysis;
CREATE POLICY "Users can read their own scans"
    ON public.skin_analysis
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own scans" ON public.skin_analysis;
DROP POLICY IF EXISTS "Users can update their own scans" ON public.skin_analysis;
DROP POLICY IF EXISTS "Users can delete their own scans" ON public.skin_analysis;

DROP POLICY IF EXISTS "Users can read their own subscription" ON public.subscriptions;
CREATE POLICY "Users can read their own subscription"
    ON public.subscriptions
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can delete their own subscription" ON public.subscriptions;

-- Browser clients are read-only. All writes go through the authenticated backend
-- using the service role, which bypasses RLS.
REVOKE ALL ON TABLE public.skin_analysis FROM anon;
REVOKE ALL ON TABLE public.subscriptions FROM anon;
REVOKE ALL ON TABLE public.payment_webhook_events FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.skin_analysis FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.subscriptions FROM authenticated;

GRANT SELECT ON TABLE public.skin_analysis TO authenticated;
GRANT SELECT ON TABLE public.subscriptions TO authenticated;

-- The API server uses the service role for trusted persistence and payment
-- updates. RLS is still enforced for browser-facing anon/authenticated roles.
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.skin_analysis TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.payment_webhook_events TO service_role;
