-- Day 9: signed Dodo lifecycle state and atomic monthly scan quotas.
-- All writes and RPC execution remain service-role-only.

ALTER TABLE public.subscriptions
    DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active', 'cancelled', 'past_due', 'pending', 'on_hold', 'paused', 'failed', 'expired'));

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS dodo_product_id TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS provider_last_event_id TEXT,
    ADD COLUMN IF NOT EXISTS provider_last_event_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS provider_last_sent_at TIMESTAMPTZ;

ALTER TABLE public.billing_checkout_attempts
    DROP CONSTRAINT IF EXISTS billing_checkout_attempts_state_check,
    DROP CONSTRAINT IF EXISTS billing_checkout_attempts_check,
    DROP CONSTRAINT IF EXISTS billing_checkout_attempts_shape_check;

ALTER TABLE public.billing_checkout_attempts
    ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fulfilled_subscription_id TEXT;

ALTER TABLE public.billing_checkout_attempts
    ADD CONSTRAINT billing_checkout_attempts_state_check
    CHECK (state IN ('creating', 'ready', 'failed', 'ambiguous', 'expired', 'fulfilled'));

ALTER TABLE public.billing_checkout_attempts
    ADD CONSTRAINT billing_checkout_attempts_shape_check
    CHECK (
        (state IN ('ready', 'fulfilled') AND (provider_session_id IS NOT NULL OR state = 'fulfilled'))
        OR
        (state NOT IN ('ready', 'fulfilled') AND provider_session_id IS NULL AND checkout_url IS NULL)
    );

ALTER TABLE public.payment_webhook_events
    ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS outcome TEXT,
    ADD COLUMN IF NOT EXISTS delivery_count INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_payload_hash TEXT,
    ADD COLUMN IF NOT EXISTS payload_changed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.payment_webhook_events
    DROP CONSTRAINT IF EXISTS payment_webhook_events_outcome_check;

ALTER TABLE public.payment_webhook_events
    ADD CONSTRAINT payment_webhook_events_outcome_check
    CHECK (outcome IS NULL OR outcome IN ('applied', 'stale', 'superseded', 'ignored'));

CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_event_order
    ON public.subscriptions (dodo_subscription_id, provider_last_sent_at, provider_last_event_at);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_subscription
    ON public.payment_webhook_events (subscription_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.scan_quota_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    plan_snapshot TEXT,
    limit_snapshot INTEGER,
    state TEXT NOT NULL DEFAULT 'reserved'
        CHECK (state IN ('reserved', 'consumed', 'refunded', 'expired')),
    scan_id UUID UNIQUE REFERENCES public.skin_analysis(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    failure_code TEXT
        CHECK (failure_code IS NULL OR failure_code IN (
            'provider_failed', 'processing_failed', 'persistence_failed', 'reservation_timeout'
        )),
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (window_end > window_start),
    CHECK (state = 'reserved' OR expires_at IS NOT NULL OR state IN ('consumed', 'refunded', 'expired')),
    CHECK (plan_snapshot IS NULL OR plan_snapshot IN ('free', 'starter', 'growth', 'pro')),
    CHECK (limit_snapshot IS NULL OR limit_snapshot > 0)
);

CREATE INDEX IF NOT EXISTS idx_scan_quota_reservations_user_window
    ON public.scan_quota_reservations (user_id, window_start, state);
CREATE INDEX IF NOT EXISTS idx_scan_quota_reservations_expiry
    ON public.scan_quota_reservations (expires_at)
    WHERE state = 'reserved';

DROP TRIGGER IF EXISTS set_scan_quota_reservations_updated_at
    ON public.scan_quota_reservations;
CREATE TRIGGER set_scan_quota_reservations_updated_at
    BEFORE UPDATE ON public.scan_quota_reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public._effective_scan_entitlement(
    p_user_id UUID
)
RETURNS TABLE (
    stored_plan TEXT,
    stored_status TEXT,
    effective_plan TEXT,
    effective_limit INTEGER,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN,
    can_manage_billing BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_subscription public.subscriptions%ROWTYPE;
BEGIN
    SELECT subscriptions.*
    INTO v_subscription
    FROM public.subscriptions AS subscriptions
    WHERE subscriptions.user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            'free'::TEXT,
            'active'::TEXT,
            'free'::TEXT,
            1,
            NULL::TIMESTAMPTZ,
            FALSE,
            FALSE;
        RETURN;
    END IF;

    IF v_subscription.plan IN ('starter', 'growth', 'pro')
       AND v_subscription.status = 'active'
       AND v_subscription.current_period_end IS NOT NULL
       AND v_subscription.current_period_end > now() THEN
        RETURN QUERY SELECT
            v_subscription.plan,
            v_subscription.status,
            v_subscription.plan,
            CASE v_subscription.plan
                WHEN 'starter' THEN 15
                WHEN 'growth' THEN 30
                WHEN 'pro' THEN 50
                ELSE 1
            END,
            v_subscription.current_period_end,
            v_subscription.cancel_at_period_end,
            (v_subscription.dodo_customer_id IS NOT NULL);
        RETURN;
    END IF;

    RETURN QUERY SELECT
        v_subscription.plan,
        v_subscription.status,
        'free'::TEXT,
        1,
        v_subscription.current_period_end,
        v_subscription.cancel_at_period_end,
        (v_subscription.dodo_customer_id IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_scan_quota_status(
    p_user_id UUID
)
RETURNS TABLE (
    plan TEXT,
    status TEXT,
    effective_plan TEXT,
    quota_limit INTEGER,
    used INTEGER,
    remaining INTEGER,
    reserved INTEGER,
    window_start TIMESTAMPTZ,
    reset_at TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN,
    can_manage_billing BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_entitlement RECORD;
    v_window_start TIMESTAMPTZ;
    v_window_end TIMESTAMPTZ;
    v_used INTEGER;
    v_reserved INTEGER;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user id is required' USING ERRCODE = '22023';
    END IF;

    v_window_start := date_trunc('month', timezone('UTC', now())) AT TIME ZONE 'UTC';
    v_window_end := (v_window_start AT TIME ZONE 'UTC' + INTERVAL '1 month') AT TIME ZONE 'UTC';

    UPDATE public.scan_quota_reservations
    SET state = 'expired',
        failure_code = 'reservation_timeout',
        refunded_at = COALESCE(refunded_at, now())
    WHERE user_id = p_user_id
      AND state = 'reserved'
      AND expires_at <= now();

    SELECT * INTO v_entitlement FROM public._effective_scan_entitlement(p_user_id);

    SELECT COUNT(*)::INTEGER
    INTO v_used
    FROM public.scan_quota_reservations
    WHERE user_id = p_user_id
      AND window_start = v_window_start
      AND state = 'consumed';

    SELECT COUNT(*)::INTEGER
    INTO v_reserved
    FROM public.scan_quota_reservations
    WHERE user_id = p_user_id
      AND window_start = v_window_start
      AND state = 'reserved'
      AND expires_at > now();

    RETURN QUERY SELECT
        v_entitlement.stored_plan,
        v_entitlement.stored_status,
        v_entitlement.effective_plan,
        v_entitlement.effective_limit,
        v_used,
        GREATEST(0, v_entitlement.effective_limit - v_used - v_reserved),
        v_reserved,
        v_window_start,
        v_window_end,
        v_entitlement.current_period_end,
        v_entitlement.cancel_at_period_end,
        v_entitlement.can_manage_billing;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_scan_quota(
    p_user_id UUID
)
RETURNS TABLE (
    granted BOOLEAN,
    reservation_id UUID,
    plan TEXT,
    status TEXT,
    effective_plan TEXT,
    quota_limit INTEGER,
    used INTEGER,
    remaining INTEGER,
    reserved INTEGER,
    window_start TIMESTAMPTZ,
    reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_entitlement RECORD;
    v_window_start TIMESTAMPTZ;
    v_window_end TIMESTAMPTZ;
    v_used INTEGER;
    v_reserved INTEGER;
    v_reservation_id UUID;
    v_granted BOOLEAN := FALSE;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user id is required' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        'tejai-scan-quota:' || p_user_id::TEXT || ':' ||
        to_char(timezone('UTC', now()), 'YYYY-MM'),
        0
    ));
    PERFORM 1 FROM public.subscriptions WHERE user_id = p_user_id FOR UPDATE;

    v_window_start := date_trunc('month', timezone('UTC', now())) AT TIME ZONE 'UTC';
    v_window_end := (v_window_start AT TIME ZONE 'UTC' + INTERVAL '1 month') AT TIME ZONE 'UTC';

    UPDATE public.scan_quota_reservations
    SET state = 'expired',
        failure_code = 'reservation_timeout',
        refunded_at = COALESCE(refunded_at, now())
    WHERE user_id = p_user_id
      AND state = 'reserved'
      AND expires_at <= now();

    SELECT * INTO v_entitlement FROM public._effective_scan_entitlement(p_user_id);

    SELECT COUNT(*)::INTEGER
    INTO v_used
    FROM public.scan_quota_reservations
    WHERE user_id = p_user_id
      AND window_start = v_window_start
      AND state = 'consumed';

    SELECT COUNT(*)::INTEGER
    INTO v_reserved
    FROM public.scan_quota_reservations
    WHERE user_id = p_user_id
      AND window_start = v_window_start
      AND state = 'reserved'
      AND expires_at > now();

    IF v_used + v_reserved < v_entitlement.effective_limit THEN
        INSERT INTO public.scan_quota_reservations (
            user_id, window_start, window_end, plan_snapshot, limit_snapshot, state, expires_at
        ) VALUES (
            p_user_id, v_window_start, v_window_end, v_entitlement.effective_plan,
            v_entitlement.effective_limit, 'reserved', now() + INTERVAL '10 minutes'
        )
        RETURNING id INTO v_reservation_id;
        v_reserved := v_reserved + 1;
        v_granted := TRUE;
    END IF;

    RETURN QUERY SELECT
        v_granted,
        v_reservation_id,
        v_entitlement.stored_plan,
        v_entitlement.stored_status,
        v_entitlement.effective_plan,
        v_entitlement.effective_limit,
        v_used,
        GREATEST(0, v_entitlement.effective_limit - v_used - v_reserved),
        v_reserved,
        v_window_start,
        v_window_end;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_scan_quota(
    p_user_id UUID,
    p_reservation_id UUID,
    p_failure_code TEXT
)
RETURNS TABLE (refunded BOOLEAN, state TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_state TEXT;
BEGIN
    IF p_failure_code NOT IN ('provider_failed', 'processing_failed', 'persistence_failed', 'reservation_timeout') THEN
        RAISE EXCEPTION 'invalid quota failure code' USING ERRCODE = '22023';
    END IF;

    SELECT reservations.state
    INTO v_state
    FROM public.scan_quota_reservations AS reservations
    WHERE reservations.id = p_reservation_id
      AND reservations.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT;
        RETURN;
    END IF;

    IF v_state = 'reserved' THEN
        UPDATE public.scan_quota_reservations
        SET state = 'refunded', failure_code = p_failure_code, refunded_at = now()
        WHERE id = p_reservation_id AND user_id = p_user_id AND state = 'reserved';
        RETURN QUERY SELECT TRUE, 'refunded'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY SELECT (v_state IN ('refunded', 'expired')), v_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_scan_and_consume_quota(
    p_user_id UUID,
    p_reservation_id UUID,
    p_glow_score INTEGER,
    p_skin_type TEXT,
    p_concerns JSONB,
    p_routine JSONB,
    p_metrics JSONB,
    p_provider TEXT,
    p_provider_version TEXT
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    image_url TEXT,
    image_retained BOOLEAN,
    glow_score INTEGER,
    skin_type TEXT,
    concerns JSONB,
    routine JSONB,
    metrics JSONB,
    provider TEXT,
    provider_version TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_reservation public.scan_quota_reservations%ROWTYPE;
    v_scan_id UUID;
BEGIN
    IF p_glow_score IS NULL OR p_glow_score < 0 OR p_glow_score > 100 THEN
        RAISE EXCEPTION 'invalid glow score' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_concerns) <> 'array' OR jsonb_typeof(p_routine) <> 'object' OR jsonb_typeof(p_metrics) <> 'object' THEN
        RAISE EXCEPTION 'invalid scan payload shape' USING ERRCODE = '22023';
    END IF;
    IF p_provider <> 'ailabtools' OR p_provider_version <> 'skin-analysis-pro-v1.7.1' THEN
        RAISE EXCEPTION 'invalid scan provider' USING ERRCODE = '22023';
    END IF;

    SELECT reservations.*
    INTO v_reservation
    FROM public.scan_quota_reservations AS reservations
    WHERE reservations.id = p_reservation_id
      AND reservations.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'quota reservation not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_reservation.state = 'consumed' AND v_reservation.scan_id IS NOT NULL THEN
        RETURN QUERY
        SELECT scans.id, scans.user_id, scans.image_url, scans.image_retained,
            scans.glow_score, scans.skin_type, scans.concerns, scans.routine,
            scans.metrics, scans.provider, scans.provider_version,
            scans.created_at, scans.updated_at
        FROM public.skin_analysis AS scans
        WHERE scans.id = v_reservation.scan_id;
        RETURN;
    END IF;

    IF v_reservation.state <> 'reserved' OR v_reservation.expires_at <= now() THEN
        RAISE EXCEPTION 'quota reservation is no longer available' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.skin_analysis (
        user_id, image_url, image_retained, glow_score, skin_type,
        concerns, routine, metrics, raw_api_response, provider, provider_version
    ) VALUES (
        p_user_id, NULL, FALSE, p_glow_score, NULLIF(left(COALESCE(p_skin_type, ''), 160), ''),
        p_concerns, p_routine, p_metrics, NULL, p_provider, p_provider_version
    )
    RETURNING skin_analysis.id INTO v_scan_id;

    UPDATE public.scan_quota_reservations
    SET state = 'consumed', scan_id = v_scan_id, consumed_at = now(), expires_at = NULL
    WHERE id = p_reservation_id AND user_id = p_user_id AND state = 'reserved';

    RETURN QUERY
    SELECT scans.id, scans.user_id, scans.image_url, scans.image_retained,
        scans.glow_score, scans.skin_type, scans.concerns, scans.routine,
        scans.metrics, scans.provider, scans.provider_version,
        scans.created_at, scans.updated_at
    FROM public.skin_analysis AS scans
    WHERE scans.id = v_scan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_dodo_subscription_event(
    p_provider_event_id TEXT,
    p_event_type TEXT,
    p_payload_hash TEXT,
    p_event_at TIMESTAMPTZ,
    p_sent_at TIMESTAMPTZ,
    p_subscription_id TEXT,
    p_customer_id TEXT,
    p_product_id TEXT,
    p_plan TEXT,
    p_status TEXT,
    p_period_start TIMESTAMPTZ,
    p_period_end TIMESTAMPTZ,
    p_cancel_at_period_end BOOLEAN,
    p_cancelled_at TIMESTAMPTZ,
    p_expires_at TIMESTAMPTZ,
    p_metadata_user_id UUID,
    p_checkout_attempt_id UUID,
    p_metadata_plan TEXT
)
RETURNS TABLE (outcome TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_event public.payment_webhook_events%ROWTYPE;
    v_existing_subscription public.subscriptions%ROWTYPE;
    v_user_subscription public.subscriptions%ROWTYPE;
    v_attempt public.billing_checkout_attempts%ROWTYPE;
    v_user_id UUID;
    v_outcome TEXT := 'applied';
BEGIN
    IF p_provider_event_id IS NULL OR length(p_provider_event_id) NOT BETWEEN 1 AND 255
       OR p_payload_hash !~ '^[0-9a-f]{64}$'
       OR p_subscription_id IS NULL OR length(p_subscription_id) NOT BETWEEN 1 AND 255
       OR p_customer_id IS NULL OR length(p_customer_id) NOT BETWEEN 1 AND 255
       OR p_product_id IS NULL OR length(p_product_id) NOT BETWEEN 1 AND 255
       OR p_plan NOT IN ('starter', 'growth', 'pro')
       OR p_status NOT IN ('active', 'cancelled', 'past_due', 'pending', 'on_hold', 'paused', 'failed', 'expired')
       OR p_event_at IS NULL OR p_sent_at IS NULL THEN
        RAISE EXCEPTION 'invalid subscription webhook fields' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('tejai-webhook:' || p_provider_event_id, 0));

    SELECT events.*
    INTO v_existing_event
    FROM public.payment_webhook_events AS events
    WHERE events.provider_event_id = p_provider_event_id
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.payment_webhook_events
        SET delivery_count = delivery_count + 1,
            last_seen_at = now(),
            last_payload_hash = p_payload_hash,
            payload_changed = payload_changed OR payload_hash <> p_payload_hash
        WHERE provider_event_id = p_provider_event_id;
        RETURN QUERY SELECT 'duplicate'::TEXT;
        RETURN;
    END IF;

    SELECT subscriptions.*
    INTO v_existing_subscription
    FROM public.subscriptions AS subscriptions
    WHERE subscriptions.dodo_subscription_id = p_subscription_id
    FOR UPDATE;

    IF FOUND THEN
        v_user_id := v_existing_subscription.user_id;
        IF p_metadata_user_id IS NOT NULL AND p_metadata_user_id <> v_user_id THEN
            RAISE EXCEPTION 'subscription owner conflict' USING ERRCODE = 'P0001';
        END IF;
        IF v_existing_subscription.dodo_customer_id IS NOT NULL
           AND v_existing_subscription.dodo_customer_id <> p_customer_id THEN
            RAISE EXCEPTION 'subscription customer conflict' USING ERRCODE = 'P0001';
        END IF;

        IF v_existing_subscription.provider_last_sent_at IS NOT NULL
           AND ROW(p_sent_at, p_event_at, p_provider_event_id)
               <= ROW(v_existing_subscription.provider_last_sent_at,
                      COALESCE(v_existing_subscription.provider_last_event_at, '-infinity'::TIMESTAMPTZ),
                      COALESCE(v_existing_subscription.provider_last_event_id, '')) THEN
            v_outcome := 'stale';
        END IF;
    ELSE
        IF p_metadata_user_id IS NULL OR p_checkout_attempt_id IS NULL THEN
            RAISE EXCEPTION 'subscription owner metadata missing' USING ERRCODE = 'P0001';
        END IF;
        IF p_metadata_plan IS NOT NULL AND p_metadata_plan <> p_plan THEN
            RAISE EXCEPTION 'subscription plan metadata conflict' USING ERRCODE = 'P0001';
        END IF;

        SELECT attempts.*
        INTO v_attempt
        FROM public.billing_checkout_attempts AS attempts
        WHERE attempts.id = p_checkout_attempt_id
          AND attempts.user_id = p_metadata_user_id
        FOR UPDATE;

        IF NOT FOUND OR v_attempt.plan <> p_plan THEN
            RAISE EXCEPTION 'checkout attempt association invalid' USING ERRCODE = 'P0001';
        END IF;
        IF v_attempt.fulfilled_subscription_id IS NOT NULL
           AND v_attempt.fulfilled_subscription_id <> p_subscription_id THEN
            INSERT INTO public.payment_webhook_events (
                provider_event_id, event_type, payload_hash, event_at, sent_at,
                subscription_id, outcome, processed_at, last_seen_at, last_payload_hash
            ) VALUES (
                p_provider_event_id, p_event_type, p_payload_hash, p_event_at, p_sent_at,
                p_subscription_id, 'superseded', now(), now(), p_payload_hash
            );
            RETURN QUERY SELECT 'superseded'::TEXT;
            RETURN;
        END IF;

        SELECT subscriptions.*
        INTO v_user_subscription
        FROM public.subscriptions AS subscriptions
        WHERE subscriptions.user_id = p_metadata_user_id
        FOR UPDATE;

        IF FOUND
           AND v_user_subscription.dodo_subscription_id IS NOT NULL
           AND v_user_subscription.dodo_subscription_id <> p_subscription_id THEN
            -- A late delivery from a replaced subscription is safely audited
            -- and ignored; a genuinely new subscription is allowed only after
            -- the prior paid state is terminal.
            IF v_attempt.fulfilled_subscription_id = p_subscription_id THEN
                INSERT INTO public.payment_webhook_events (
                    provider_event_id, event_type, payload_hash, event_at, sent_at,
                    subscription_id, outcome, processed_at, last_seen_at, last_payload_hash
                ) VALUES (
                    p_provider_event_id, p_event_type, p_payload_hash, p_event_at, p_sent_at,
                    p_subscription_id, 'superseded', now(), now(), p_payload_hash
                );
                RETURN QUERY SELECT 'superseded'::TEXT;
                RETURN;
            END IF;
            IF v_user_subscription.status NOT IN ('cancelled', 'failed', 'expired') THEN
                RAISE EXCEPTION 'user already has another subscription' USING ERRCODE = 'P0001';
            END IF;
        END IF;
        v_user_id := p_metadata_user_id;
    END IF;

    IF v_outcome = 'stale' THEN
        INSERT INTO public.payment_webhook_events (
            provider_event_id, event_type, payload_hash, event_at, sent_at,
            subscription_id, outcome, processed_at, last_seen_at, last_payload_hash
        ) VALUES (
            p_provider_event_id, p_event_type, p_payload_hash, p_event_at, p_sent_at,
            p_subscription_id, 'stale', now(), now(), p_payload_hash
        );
        RETURN QUERY SELECT 'stale'::TEXT;
        RETURN;
    END IF;

    INSERT INTO public.subscriptions (
        user_id, plan, status, dodo_product_id, dodo_customer_id, dodo_subscription_id,
        current_period_start, current_period_end, cancel_at_period_end,
        cancelled_at, expires_at, provider_last_event_id, provider_last_event_at,
        provider_last_sent_at
    ) VALUES (
        v_user_id, p_plan, p_status, p_product_id, p_customer_id, p_subscription_id,
        p_period_start, p_period_end, COALESCE(p_cancel_at_period_end, FALSE),
        p_cancelled_at, p_expires_at, p_provider_event_id, p_event_at, p_sent_at
    )
    ON CONFLICT (user_id) DO UPDATE SET
        plan = EXCLUDED.plan,
        status = EXCLUDED.status,
        dodo_product_id = EXCLUDED.dodo_product_id,
        dodo_customer_id = EXCLUDED.dodo_customer_id,
        dodo_subscription_id = EXCLUDED.dodo_subscription_id,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        cancelled_at = EXCLUDED.cancelled_at,
        expires_at = EXCLUDED.expires_at,
        provider_last_event_id = EXCLUDED.provider_last_event_id,
        provider_last_event_at = EXCLUDED.provider_last_event_at,
        provider_last_sent_at = EXCLUDED.provider_last_sent_at;

    IF p_checkout_attempt_id IS NOT NULL THEN
        UPDATE public.billing_checkout_attempts
        SET state = 'fulfilled',
            fulfilled_at = COALESCE(fulfilled_at, now()),
            fulfilled_subscription_id = p_subscription_id,
            failure_code = NULL
        WHERE id = p_checkout_attempt_id
          AND user_id = v_user_id;
    END IF;

    INSERT INTO public.payment_webhook_events (
        provider_event_id, event_type, payload_hash, event_at, sent_at,
        subscription_id, outcome, processed_at, last_seen_at, last_payload_hash
    ) VALUES (
        p_provider_event_id, p_event_type, p_payload_hash, p_event_at, p_sent_at,
        p_subscription_id, 'applied', now(), now(), p_payload_hash
    );

    RETURN QUERY SELECT 'applied'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_dodo_webhook_event(
    p_provider_event_id TEXT,
    p_event_type TEXT,
    p_payload_hash TEXT,
    p_event_at TIMESTAMPTZ,
    p_sent_at TIMESTAMPTZ
)
RETURNS TABLE (outcome TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing public.payment_webhook_events%ROWTYPE;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('tejai-webhook:' || p_provider_event_id, 0));
    SELECT events.* INTO v_existing
    FROM public.payment_webhook_events AS events
    WHERE events.provider_event_id = p_provider_event_id
    FOR UPDATE;
    IF FOUND THEN
        UPDATE public.payment_webhook_events
        SET delivery_count = delivery_count + 1,
            last_seen_at = now(),
            last_payload_hash = p_payload_hash,
            payload_changed = payload_changed OR payload_hash <> p_payload_hash
        WHERE provider_event_id = p_provider_event_id;
        RETURN QUERY SELECT 'duplicate'::TEXT;
        RETURN;
    END IF;
    INSERT INTO public.payment_webhook_events (
        provider_event_id, event_type, payload_hash, event_at, sent_at,
        outcome, processed_at, last_seen_at, last_payload_hash
    ) VALUES (
        p_provider_event_id, p_event_type, p_payload_hash, p_event_at, p_sent_at,
        'ignored', now(), now(), p_payload_hash
    );
    RETURN QUERY SELECT 'ignored'::TEXT;
END;
$$;

ALTER TABLE public.scan_quota_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scan_quota_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scan_quota_reservations TO service_role;

REVOKE EXECUTE ON FUNCTION public._effective_scan_entitlement(UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_scan_quota_status(UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_scan_quota(UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_scan_quota(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.persist_scan_and_consume_quota(UUID, UUID, INTEGER, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_dodo_subscription_event(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_dodo_webhook_event(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._effective_scan_entitlement(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_scan_quota_status(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_scan_quota(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_scan_quota(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_scan_and_consume_quota(UUID, UUID, INTEGER, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_dodo_subscription_event(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_dodo_webhook_event(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- Preserve current-month usage for every existing scan. This is intentionally
-- repeatable and is rerun after cutover to cover the migration/backend gap.
INSERT INTO public.scan_quota_reservations (
    user_id, window_start, window_end, plan_snapshot, limit_snapshot,
    state, scan_id, expires_at, consumed_at, created_at, updated_at
)
SELECT
    scans.user_id,
    date_trunc('month', timezone('UTC', scans.created_at)) AT TIME ZONE 'UTC',
    (date_trunc('month', timezone('UTC', scans.created_at)) AT TIME ZONE 'UTC' + INTERVAL '1 month') AT TIME ZONE 'UTC',
    NULL,
    NULL,
    'consumed',
    scans.id,
    NULL,
    scans.created_at,
    scans.created_at,
    scans.updated_at
FROM public.skin_analysis AS scans
ON CONFLICT (scan_id) DO NOTHING;
