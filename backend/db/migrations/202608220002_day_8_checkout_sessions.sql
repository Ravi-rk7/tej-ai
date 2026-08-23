-- Day 8: durable, service-role-only checkout idempotency.
-- Browser clients never receive direct access to this table or claim function.

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

CREATE INDEX IF NOT EXISTS idx_billing_checkout_attempts_user_created
    ON public.billing_checkout_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_checkout_attempts_expiry
    ON public.billing_checkout_attempts (expires_at)
    WHERE state IN ('creating', 'ready');

DROP TRIGGER IF EXISTS set_billing_checkout_attempts_updated_at
    ON public.billing_checkout_attempts;
CREATE TRIGGER set_billing_checkout_attempts_updated_at
    BEFORE UPDATE ON public.billing_checkout_attempts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.billing_checkout_attempts ENABLE ROW LEVEL SECURITY;

-- No browser policies are intentionally created. RLS plus the explicit grants
-- below make checkout URLs and idempotency records private to the API server.
REVOKE ALL ON TABLE public.billing_checkout_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.billing_checkout_attempts TO service_role;

-- Subscription state now flows only through the owner-scoped backend status
-- endpoint, so provider identifiers are no longer readable by browser roles.
DROP POLICY IF EXISTS "Users can read their own subscription" ON public.subscriptions;
REVOKE ALL ON TABLE public.subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.subscriptions TO service_role;

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

    -- Serialize the same user/key pair before checking or inserting. This avoids
    -- the INSERT ... ON CONFLICT visibility race under concurrent requests.
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

REVOKE EXECUTE ON FUNCTION public.claim_billing_checkout_attempt(UUID, TEXT, TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_billing_checkout_attempt(UUID, TEXT, TEXT, TIMESTAMPTZ)
    TO service_role;
