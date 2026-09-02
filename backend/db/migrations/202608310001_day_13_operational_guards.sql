-- Day 13: identity-free provider budget reservations and safe readiness.
-- Provider usage rows intentionally contain no user, scan, image, or payload data.

CREATE TABLE IF NOT EXISTS public.provider_call_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL
        CHECK (provider IN ('ailabtools', 'openai')),
    usage_date DATE NOT NULL DEFAULT ((timezone('UTC', now()))::DATE),
    state TEXT NOT NULL DEFAULT 'reserved'
        CHECK (state IN ('reserved', 'succeeded', 'failed', 'unknown')),
    outcome TEXT
        CHECK (outcome IS NULL OR outcome IN (
            'success', 'provider_error', 'timeout', 'quota', 'refusal',
            'invalid_response', 'unavailable', 'unknown'
        )),
    input_units BIGINT NOT NULL DEFAULT 0 CHECK (input_units >= 0),
    output_units BIGINT NOT NULL DEFAULT 0 CHECK (output_units >= 0),
    estimated_cost_micros BIGINT NOT NULL DEFAULT 0
        CHECK (estimated_cost_micros >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalized_at TIMESTAMPTZ,
    CHECK (
        (state = 'reserved' AND outcome IS NULL AND finalized_at IS NULL)
        OR (state <> 'reserved' AND outcome IS NOT NULL AND finalized_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_provider_call_reservations_daily
    ON public.provider_call_reservations (provider, usage_date, state);
CREATE INDEX IF NOT EXISTS idx_provider_call_reservations_created
    ON public.provider_call_reservations (created_at);

CREATE OR REPLACE FUNCTION public.ops_readiness_probe()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION public.reserve_provider_call_budget(
    p_provider TEXT,
    p_daily_limit INTEGER
)
RETURNS TABLE (
    granted BOOLEAN,
    reservation_id UUID,
    used INTEGER,
    remaining INTEGER,
    reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_usage_date DATE := (timezone('UTC', now()))::DATE;
    v_used INTEGER;
    v_reservation_id UUID;
    v_reset_at TIMESTAMPTZ;
BEGIN
    IF p_provider NOT IN ('ailabtools', 'openai') THEN
        RAISE EXCEPTION 'invalid provider' USING ERRCODE = '22023';
    END IF;
    IF p_daily_limit IS NULL OR p_daily_limit < 1 OR p_daily_limit > 100000 THEN
        RAISE EXCEPTION 'invalid provider daily limit' USING ERRCODE = '22023';
    END IF;

    v_reset_at := ((v_usage_date + 1)::TIMESTAMP AT TIME ZONE 'UTC');
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'tejai-provider-budget:' || p_provider || ':' || v_usage_date::TEXT,
            0
        )
    );

    SELECT count(*)::INTEGER
    INTO v_used
    FROM public.provider_call_reservations AS reservations
    WHERE reservations.provider = p_provider
      AND reservations.usage_date = v_usage_date;

    IF v_used >= p_daily_limit THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, v_used, 0, v_reset_at;
        RETURN;
    END IF;

    INSERT INTO public.provider_call_reservations (provider, usage_date)
    VALUES (p_provider, v_usage_date)
    RETURNING id INTO v_reservation_id;

    RETURN QUERY SELECT
        TRUE,
        v_reservation_id,
        v_used + 1,
        GREATEST(0, p_daily_limit - v_used - 1),
        v_reset_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_provider_call(
    p_reservation_id UUID,
    p_state TEXT,
    p_outcome TEXT,
    p_input_units BIGINT DEFAULT 0,
    p_output_units BIGINT DEFAULT 0,
    p_estimated_cost_micros BIGINT DEFAULT 0
)
RETURNS TABLE (finalized BOOLEAN, state TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_state TEXT;
BEGIN
    IF p_reservation_id IS NULL
        OR p_state NOT IN ('succeeded', 'failed', 'unknown')
        OR p_outcome NOT IN (
            'success', 'provider_error', 'timeout', 'quota', 'refusal',
            'invalid_response', 'unavailable', 'unknown'
        )
        OR COALESCE(p_input_units, -1) < 0
        OR COALESCE(p_output_units, -1) < 0
        OR COALESCE(p_estimated_cost_micros, -1) < 0
    THEN
        RAISE EXCEPTION 'invalid provider finalization fields' USING ERRCODE = '22023';
    END IF;

    SELECT reservations.state
    INTO v_state
    FROM public.provider_call_reservations AS reservations
    WHERE reservations.id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT;
        RETURN;
    END IF;

    IF v_state = 'reserved' THEN
        UPDATE public.provider_call_reservations
        SET state = p_state,
            outcome = p_outcome,
            input_units = p_input_units,
            output_units = p_output_units,
            estimated_cost_micros = p_estimated_cost_micros,
            finalized_at = now()
        WHERE id = p_reservation_id AND state = 'reserved';
        RETURN QUERY SELECT TRUE, p_state;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, v_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_provider_usage_summary(
    p_usage_date DATE DEFAULT ((timezone('UTC', now()))::DATE)
)
RETURNS TABLE (
    provider TEXT,
    attempted BIGINT,
    succeeded BIGINT,
    failed BIGINT,
    pending BIGINT,
    input_units BIGINT,
    output_units BIGINT,
    estimated_cost_micros BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        reservations.provider,
        count(*)::BIGINT AS attempted,
        count(*) FILTER (WHERE reservations.state = 'succeeded')::BIGINT AS succeeded,
        count(*) FILTER (WHERE reservations.state IN ('failed', 'unknown'))::BIGINT AS failed,
        count(*) FILTER (WHERE reservations.state = 'reserved')::BIGINT AS pending,
        COALESCE(sum(reservations.input_units), 0)::BIGINT AS input_units,
        COALESCE(sum(reservations.output_units), 0)::BIGINT AS output_units,
        COALESCE(sum(reservations.estimated_cost_micros), 0)::BIGINT AS estimated_cost_micros
    FROM public.provider_call_reservations AS reservations
    WHERE reservations.usage_date = p_usage_date
    GROUP BY reservations.provider
    ORDER BY reservations.provider;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_provider_call_reservations(
    p_before DATE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deleted BIGINT;
BEGIN
    IF p_before IS NULL OR p_before > ((timezone('UTC', now()))::DATE - 30) THEN
        RAISE EXCEPTION 'provider usage retention must be at least 30 days'
            USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.provider_call_reservations
    WHERE usage_date < p_before;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

ALTER TABLE public.provider_call_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_call_reservations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.provider_call_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.provider_call_reservations TO service_role;

REVOKE EXECUTE ON FUNCTION public.ops_readiness_probe() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_provider_call_budget(TEXT, INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_provider_call(UUID, TEXT, TEXT, BIGINT, BIGINT, BIGINT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_provider_usage_summary(DATE)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_provider_call_reservations(DATE)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ops_readiness_probe() TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_provider_call_budget(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_provider_call(UUID, TEXT, TEXT, BIGINT, BIGINT, BIGINT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_provider_usage_summary(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_provider_call_reservations(DATE) TO service_role;
