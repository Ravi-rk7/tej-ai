-- Day 11: remove direct browser data access and harden public-schema privileges.
-- The backend service role remains the only application data-access boundary.

DROP POLICY IF EXISTS "Users can read their own scans" ON public.skin_analysis;

REVOKE ALL ON TABLE public.skin_analysis FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.skin_analysis TO service_role;

REVOKE ALL ON TABLE public.subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payment_webhook_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_checkout_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.scan_quota_reservations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.privacy_consent_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.privacy_deletion_audits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.deleted_billing_subjects FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_webhook_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_checkout_attempts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scan_quota_reservations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.privacy_consent_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.privacy_deletion_audits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deleted_billing_subjects TO service_role;

REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.set_updated_at()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_free_subscription_for_new_user()
    FROM PUBLIC, anon, authenticated;

ALTER TABLE public.skin_analysis FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_checkout_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.scan_quota_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_consent_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_deletion_audits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_billing_subjects FORCE ROW LEVEL SECURITY;

-- Reassert that browser roles cannot execute trusted application RPCs.
REVOKE EXECUTE ON FUNCTION public.claim_billing_checkout_attempt(UUID, TEXT, TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
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
REVOKE EXECUTE ON FUNCTION public.delete_user_scan_with_audit(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_account_deletion(TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_account_billing_deletion(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_deleted_dodo_subscription_event(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
    FROM PUBLIC, anon, authenticated;
