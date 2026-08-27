-- Day 10: versioned face-scan consent, owner-scoped deletion, and
-- privacy-safe billing tombstones. All writes remain service-role-only.

CREATE TABLE IF NOT EXISTS public.privacy_consent_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL
        CHECK (purpose = 'face_scan_analysis'),
    action TEXT NOT NULL
        CHECK (action IN ('granted', 'withdrawn')),
    notice_version TEXT NOT NULL
        CHECK (length(notice_version) BETWEEN 1 AND 100),
    adult_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (action = 'granted' AND adult_confirmed = TRUE)
        OR (action = 'withdrawn' AND adult_confirmed = FALSE)
    )
);

CREATE INDEX IF NOT EXISTS idx_privacy_consent_events_user_purpose_created
    ON public.privacy_consent_events (user_id, purpose, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.privacy_deletion_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_hash TEXT NOT NULL
        CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
    scope TEXT NOT NULL
        CHECK (scope IN ('scan', 'account')),
    target_hash TEXT
        CHECK (target_hash IS NULL OR target_hash ~ '^[0-9a-f]{64}$'),
    stage TEXT NOT NULL
        CHECK (stage IN (
            'claimed', 'provider_cancelled', 'billing_prepared',
            'auth_deleted', 'completed', 'failed'
        )),
    outcome TEXT NOT NULL
        CHECK (outcome IN ('in_progress', 'completed', 'failed')),
    failure_code TEXT
        CHECK (failure_code IS NULL OR length(failure_code) BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    purge_after TIMESTAMPTZ NOT NULL,
    CHECK (purge_after > created_at),
    CHECK ((outcome = 'completed') = (completed_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_privacy_deletion_one_active_account
    ON public.privacy_deletion_audits (subject_hash)
    WHERE scope = 'account' AND outcome = 'in_progress';
CREATE INDEX IF NOT EXISTS idx_privacy_deletion_audits_purge
    ON public.privacy_deletion_audits (purge_after);

CREATE TABLE IF NOT EXISTS public.deleted_billing_subjects (
    subscription_hash TEXT PRIMARY KEY
        CHECK (subscription_hash ~ '^[0-9a-f]{64}$'),
    customer_hash TEXT
        CHECK (customer_hash IS NULL OR customer_hash ~ '^[0-9a-f]{64}$'),
    deletion_audit_id UUID REFERENCES public.privacy_deletion_audits(id) ON DELETE SET NULL,
    cancelled_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK (expires_at > deleted_at)
);

CREATE INDEX IF NOT EXISTS idx_deleted_billing_subjects_expiry
    ON public.deleted_billing_subjects (expires_at);

CREATE OR REPLACE FUNCTION public.delete_user_scan_with_audit(
    p_user_id UUID,
    p_scan_id UUID,
    p_subject_hash TEXT,
    p_target_hash TEXT,
    p_purge_after TIMESTAMPTZ
)
RETURNS TABLE (deleted BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deleted_id UUID;
BEGIN
    IF p_user_id IS NULL OR p_scan_id IS NULL
       OR p_subject_hash !~ '^[0-9a-f]{64}$'
       OR p_target_hash !~ '^[0-9a-f]{64}$'
       OR p_purge_after IS NULL OR p_purge_after <= now() THEN
        RAISE EXCEPTION 'invalid scan deletion fields' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('tejai-scan-delete:' || p_scan_id::TEXT, 0));

    DELETE FROM public.skin_analysis
    WHERE id = p_scan_id AND user_id = p_user_id
    RETURNING id INTO v_deleted_id;

    IF v_deleted_id IS NULL THEN
        RETURN QUERY SELECT FALSE;
        RETURN;
    END IF;

    INSERT INTO public.privacy_deletion_audits (
        subject_hash, scope, target_hash, stage, outcome,
        completed_at, purge_after
    ) VALUES (
        p_subject_hash, 'scan', p_target_hash, 'completed', 'completed',
        now(), p_purge_after
    );

    RETURN QUERY SELECT TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_account_deletion(
    p_subject_hash TEXT,
    p_purge_after TIMESTAMPTZ
)
RETURNS TABLE (
    audit_id UUID,
    stage TEXT,
    claimed BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_audit public.privacy_deletion_audits%ROWTYPE;
BEGIN
    IF p_subject_hash !~ '^[0-9a-f]{64}$'
       OR p_purge_after IS NULL OR p_purge_after <= now() THEN
        RAISE EXCEPTION 'invalid account deletion fields' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('tejai-account-delete:' || p_subject_hash, 0));

    SELECT audits.* INTO v_audit
    FROM public.privacy_deletion_audits AS audits
    WHERE audits.subject_hash = p_subject_hash
      AND audits.scope = 'account'
      AND audits.outcome = 'in_progress'
    ORDER BY audits.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        RETURN QUERY SELECT v_audit.id, v_audit.stage, FALSE;
        RETURN;
    END IF;

    INSERT INTO public.privacy_deletion_audits (
        subject_hash, scope, stage, outcome, purge_after
    ) VALUES (
        p_subject_hash, 'account', 'claimed', 'in_progress', p_purge_after
    ) RETURNING * INTO v_audit;

    RETURN QUERY SELECT v_audit.id, v_audit.stage, TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_account_billing_deletion(
    p_audit_id UUID,
    p_subscription_id TEXT,
    p_subscription_hash TEXT,
    p_customer_hash TEXT,
    p_cancelled_at TIMESTAMPTZ,
    p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (prepared BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_audit public.privacy_deletion_audits%ROWTYPE;
BEGIN
    IF p_audit_id IS NULL
       OR p_subscription_id IS NULL OR length(p_subscription_id) NOT BETWEEN 1 AND 255
       OR p_subscription_hash !~ '^[0-9a-f]{64}$'
       OR (p_customer_hash IS NOT NULL AND p_customer_hash !~ '^[0-9a-f]{64}$')
       OR p_cancelled_at IS NULL
       OR p_expires_at IS NULL OR p_expires_at <= now() THEN
        RAISE EXCEPTION 'invalid billing deletion fields' USING ERRCODE = '22023';
    END IF;

    SELECT audits.* INTO v_audit
    FROM public.privacy_deletion_audits AS audits
    WHERE audits.id = p_audit_id
      AND audits.scope = 'account'
      AND audits.outcome = 'in_progress'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'account deletion audit not found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.deleted_billing_subjects (
        subscription_hash, customer_hash, deletion_audit_id,
        cancelled_at, expires_at
    ) VALUES (
        p_subscription_hash, p_customer_hash, p_audit_id,
        p_cancelled_at, p_expires_at
    )
    ON CONFLICT (subscription_hash) DO UPDATE SET
        customer_hash = EXCLUDED.customer_hash,
        deletion_audit_id = EXCLUDED.deletion_audit_id,
        cancelled_at = EXCLUDED.cancelled_at,
        expires_at = GREATEST(deleted_billing_subjects.expires_at, EXCLUDED.expires_at);

    UPDATE public.payment_webhook_events
    SET subscription_id = 'deleted:' || p_subscription_hash
    WHERE subscription_id = p_subscription_id;

    UPDATE public.privacy_deletion_audits
    SET stage = 'billing_prepared', updated_at = now(), failure_code = NULL
    WHERE id = p_audit_id;

    RETURN QUERY SELECT TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_deleted_dodo_subscription_event(
    p_provider_event_id TEXT,
    p_event_type TEXT,
    p_payload_hash TEXT,
    p_event_at TIMESTAMPTZ,
    p_sent_at TIMESTAMPTZ,
    p_subscription_hash TEXT
)
RETURNS TABLE (matched BOOLEAN, outcome TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing public.payment_webhook_events%ROWTYPE;
BEGIN
    IF p_provider_event_id IS NULL OR length(p_provider_event_id) NOT BETWEEN 1 AND 255
       OR p_event_type IS NULL OR length(p_event_type) NOT BETWEEN 1 AND 120
       OR p_payload_hash !~ '^[0-9a-f]{64}$'
       OR p_subscription_hash !~ '^[0-9a-f]{64}$'
       OR p_event_at IS NULL OR p_sent_at IS NULL THEN
        RAISE EXCEPTION 'invalid deleted webhook fields' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.deleted_billing_subjects AS deleted
        WHERE deleted.subscription_hash = p_subscription_hash
          AND deleted.expires_at > now()
    ) THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT;
        RETURN;
    END IF;

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
        RETURN QUERY SELECT TRUE, 'duplicate'::TEXT;
        RETURN;
    END IF;

    INSERT INTO public.payment_webhook_events (
        provider_event_id, event_type, payload_hash, event_at, sent_at,
        subscription_id, outcome, processed_at, last_seen_at, last_payload_hash
    ) VALUES (
        p_provider_event_id, p_event_type, p_payload_hash, p_event_at, p_sent_at,
        'deleted:' || p_subscription_hash, 'ignored', now(), now(), p_payload_hash
    );

    RETURN QUERY SELECT TRUE, 'ignored'::TEXT;
END;
$$;

ALTER TABLE public.privacy_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_deletion_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_billing_subjects ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.privacy_consent_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.privacy_deletion_audits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.deleted_billing_subjects FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE public.privacy_consent_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.privacy_deletion_audits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deleted_billing_subjects TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_user_scan_with_audit(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_account_deletion(TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_account_billing_deletion(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_deleted_dodo_subscription_event(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.delete_user_scan_with_audit(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_account_deletion(TEXT, TIMESTAMPTZ)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_account_billing_deletion(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.record_deleted_dodo_subscription_event(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
    TO service_role;
