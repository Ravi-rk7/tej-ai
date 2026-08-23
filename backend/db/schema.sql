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

CREATE TABLE IF NOT EXISTS public.billing_checkout_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL
        CHECK (plan IN ('starter', 'growth', 'pro')),
    idempotency_key_hash TEXT NOT NULL
        CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
    state TEXT NOT NULL DEFAULT 'creating'
        CHECK (state IN ('creating', 'ready', 'failed', 'ambiguous', 'expired')),
    provider_session_id TEXT UNIQUE,
    checkout_url TEXT,
    failure_code TEXT
        CHECK (failure_code IS NULL OR length(failure_code) <= 100),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key_hash),
    CHECK (
        (state = 'ready' AND provider_session_id IS NOT NULL AND checkout_url IS NOT NULL)
        OR
        (state <> 'ready' AND provider_session_id IS NULL AND checkout_url IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_skin_analysis_user_created
    ON public.skin_analysis (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skin_analysis_user_created_id
    ON public.skin_analysis (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_period_end
    ON public.subscriptions (status, current_period_end);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_created
    ON public.payment_webhook_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_checkout_attempts_user_created
    ON public.billing_checkout_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_checkout_attempts_expiry
    ON public.billing_checkout_attempts (expires_at)
    WHERE state IN ('creating', 'ready');

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

DROP TRIGGER IF EXISTS set_billing_checkout_attempts_updated_at
    ON public.billing_checkout_attempts;
CREATE TRIGGER set_billing_checkout_attempts_updated_at
    BEFORE UPDATE ON public.billing_checkout_attempts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.claim_billing_checkout_attempt(
    p_user_id UUID,
    p_plan TEXT,
    p_idempotency_key_hash TEXT,
    p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    plan TEXT,
    idempotency_key_hash TEXT,
    state TEXT,
    provider_session_id TEXT,
    checkout_url TEXT,
    failure_code TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    claimed BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    checkout_attempt public.billing_checkout_attempts%ROWTYPE;
    checkout_claimed BOOLEAN := FALSE;
BEGIN
    IF p_plan NOT IN ('starter', 'growth', 'pro') THEN
        RAISE EXCEPTION 'invalid checkout plan' USING ERRCODE = '22023';
    END IF;
    IF p_idempotency_key_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'invalid idempotency key hash' USING ERRCODE = '22023';
    END IF;
    IF p_expires_at <= now() THEN
        RAISE EXCEPTION 'checkout expiry must be in the future' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_user_id::TEXT || ':' || p_idempotency_key_hash, 0)
    );

    SELECT attempts.*
    INTO checkout_attempt
    FROM public.billing_checkout_attempts AS attempts
    WHERE attempts.user_id = p_user_id
      AND attempts.idempotency_key_hash = p_idempotency_key_hash;

    IF NOT FOUND THEN
        INSERT INTO public.billing_checkout_attempts (
            user_id,
            plan,
            idempotency_key_hash,
            state,
            expires_at
        )
        VALUES (
            p_user_id,
            p_plan,
            p_idempotency_key_hash,
            'creating',
            p_expires_at
        )
        RETURNING * INTO checkout_attempt;
        checkout_claimed := TRUE;
    END IF;

    RETURN QUERY SELECT
        checkout_attempt.id,
        checkout_attempt.user_id,
        checkout_attempt.plan,
        checkout_attempt.idempotency_key_hash,
        checkout_attempt.state,
        checkout_attempt.provider_session_id,
        checkout_attempt.checkout_url,
        checkout_attempt.failure_code,
        checkout_attempt.expires_at,
        checkout_attempt.created_at,
        checkout_attempt.updated_at,
        checkout_claimed;
END;
$$;

ALTER TABLE public.skin_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_checkout_attempts ENABLE ROW LEVEL SECURITY;

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
DROP POLICY IF EXISTS "Users can update their own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can delete their own subscription" ON public.subscriptions;

-- Browser clients are read-only. All writes go through the authenticated backend
-- using the service role, which bypasses RLS.
REVOKE ALL ON TABLE public.skin_analysis FROM anon;
REVOKE ALL ON TABLE public.subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payment_webhook_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.billing_checkout_attempts FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.skin_analysis FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.subscriptions FROM authenticated;

GRANT SELECT ON TABLE public.skin_analysis TO authenticated;

-- The API server uses the service role for trusted persistence and payment
-- updates. RLS is still enforced for browser-facing anon/authenticated roles.
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.skin_analysis TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.payment_webhook_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.billing_checkout_attempts TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_billing_checkout_attempt(UUID, TEXT, TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_billing_checkout_attempt(UUID, TEXT, TEXT, TIMESTAMPTZ)
    TO service_role;
