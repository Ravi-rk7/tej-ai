-- Additive portfolio migration. Preserve legacy analyses and billing records.
BEGIN;
ALTER TABLE public.skin_analysis ALTER COLUMN glow_score DROP NOT NULL;
DROP TRIGGER IF EXISTS create_free_subscription_after_signup ON auth.users;

CREATE TABLE public.portfolio_scan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  idempotency_key UUID NOT NULL,
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'completed', 'failed', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() + interval '2 minutes',
  provider_started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  scan_id UUID REFERENCES public.skin_analysis(id) ON DELETE SET NULL,
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX portfolio_requests_capacity ON public.portfolio_scan_requests(created_at);
CREATE INDEX portfolio_requests_owner ON public.portfolio_scan_requests(user_id, finished_at);
ALTER TABLE public.portfolio_scan_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portfolio_scan_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_scan_requests TO service_role;

CREATE OR REPLACE FUNCTION public.portfolio_scan_status(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  used INTEGER;
  pending INTEGER;
BEGIN
  SELECT count(*) FILTER (WHERE state = 'completed' AND finished_at >= date_trunc('month', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
    count(*) FILTER (WHERE state = 'reserved' AND expires_at > v_now)
  INTO used, pending FROM public.portfolio_scan_requests WHERE user_id = p_user_id;
  RETURN jsonb_build_object('limit', 3, 'used', used, 'pending', pending, 'remaining', greatest(0, 3 - used - pending),
    'resetAt', (date_trunc('month', v_now AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC');
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_portfolio_scan(
  p_user_id UUID, p_idempotency_key UUID, p_window_limit INTEGER DEFAULT 80, p_daily_limit INTEGER DEFAULT 5
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  item public.portfolio_scan_requests%ROWTYPE;
  month_start TIMESTAMPTZ;
  day_start TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL OR p_window_limit IS NULL OR p_daily_limit IS NULL
    OR p_window_limit NOT BETWEEN 0 AND 80 OR p_daily_limit NOT BETWEEN 0 AND 5 THEN
    RAISE EXCEPTION 'SCAN_REQUEST_INVALID';
  END IF;
  -- A single global lock is deliberately simple at this project's tiny capacity.
  -- All mutations acquire it first; no process-local counters or race-prone prechecks.
  PERFORM pg_advisory_xact_lock(748060911);
  PERFORM 1 FROM auth.users WHERE id = p_user_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SCAN_REQUEST_INVALID'; END IF;
  v_now := clock_timestamp();
  month_start := date_trunc('month', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  day_start := date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  UPDATE public.portfolio_scan_requests SET state = 'expired', finished_at = v_now
    WHERE state = 'reserved' AND expires_at <= v_now;
  -- Retain 90 days of attempt accounting; the window is 31 days, not a calendar reset.
  DELETE FROM public.portfolio_scan_requests WHERE created_at < v_now - interval '90 days';
  SELECT * INTO item FROM public.portfolio_scan_requests WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('replayed', true, 'state', item.state, 'reservationId', item.id, 'scanId', item.scan_id);
  END IF;
  IF EXISTS (SELECT 1 FROM public.portfolio_scan_requests WHERE user_id = p_user_id AND state = 'reserved') THEN
    RAISE EXCEPTION 'SCAN_IN_PROGRESS';
  END IF;
  IF (SELECT count(*) FROM public.portfolio_scan_requests WHERE user_id = p_user_id AND state = 'completed' AND finished_at >= month_start) >= 3 THEN
    RAISE EXCEPTION 'USER_MONTHLY_LIMIT';
  END IF;
  IF EXISTS (SELECT 1 FROM public.portfolio_scan_requests WHERE user_id = p_user_id AND state = 'completed' AND finished_at >= day_start) THEN
    RAISE EXCEPTION 'USER_DAILY_LIMIT';
  END IF;
  IF (SELECT count(*) FROM public.portfolio_scan_requests WHERE created_at >= v_now - interval '31 days') >= p_window_limit
    OR (SELECT count(*) FROM public.portfolio_scan_requests WHERE created_at >= day_start) >= p_daily_limit THEN
    RAISE EXCEPTION 'SCAN_CAPACITY_REACHED';
  END IF;
  -- Count every accepted reservation conservatively, including failed/expired ones.
  INSERT INTO public.portfolio_scan_requests(user_id, idempotency_key) VALUES(p_user_id, p_idempotency_key) RETURNING * INTO item;
  RETURN jsonb_build_object('replayed', false, 'state', item.state, 'reservationId', item.id, 'scanId', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_portfolio_scan(p_user_id UUID, p_reservation_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(748060911);
  UPDATE public.portfolio_scan_requests SET provider_started_at = clock_timestamp()
    WHERE id = p_reservation_id AND user_id = p_user_id AND state = 'reserved'
      AND expires_at > clock_timestamp() AND provider_started_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_portfolio_scan(p_user_id UUID, p_reservation_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(748060911);
  UPDATE public.portfolio_scan_requests SET state = 'failed', finished_at = clock_timestamp()
    WHERE id = p_reservation_id AND user_id = p_user_id AND state = 'reserved';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_portfolio_scan(p_user_id UUID, p_reservation_id UUID, p_result JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE item public.portfolio_scan_requests%ROWTYPE; saved public.skin_analysis%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(748060911);
  SELECT * INTO item FROM public.portfolio_scan_requests WHERE id = p_reservation_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SCAN_RESERVATION_INVALID'; END IF;
  IF item.state = 'completed' THEN
    SELECT * INTO saved FROM public.skin_analysis WHERE id = item.scan_id AND user_id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'SCAN_RESULT_REMOVED'; END IF;
    RETURN to_jsonb(saved);
  END IF;
  IF item.state <> 'reserved' OR item.expires_at <= clock_timestamp() OR item.provider_started_at IS NULL THEN
    RAISE EXCEPTION 'SCAN_RESERVATION_INVALID';
  END IF;
  IF p_result IS NULL OR (p_result->>'schemaVersion') IS DISTINCT FROM '2'
    OR (p_result->>'source') IS DISTINCT FROM 'live' OR (p_result#>>'{provider,name}') IS DISTINCT FROM 'facepp'
    OR (p_result#>>'{provider,mappingVersion}') IS DISTINCT FROM 'categories-v1'
    OR jsonb_typeof(p_result->'observations') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_result->'metrics') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_result->'routine') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'SCAN_RESULT_INVALID';
  END IF;
  INSERT INTO public.skin_analysis(user_id, glow_score, skin_type, concerns, routine, metrics, provider, provider_version,
    image_url, cloudinary_public_id, raw_api_response, image_retained)
  VALUES(p_user_id, NULL, p_result->>'skinType', '[]', p_result->'routine',
    jsonb_build_object('schemaVersion', 2, 'portfolio', p_result - 'scanId' - 'createdAt'), 'facepp', p_result#>>'{provider,version}',
    NULL, NULL, NULL, false) RETURNING * INTO saved;
  UPDATE public.portfolio_scan_requests SET state = 'completed', finished_at = clock_timestamp(), scan_id = saved.id WHERE id = item.id;
  RETURN to_jsonb(saved);
END;
$$;

CREATE TABLE public.portfolio_deletion_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_session_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() + interval '10 minutes',
  consumed_at TIMESTAMPTZ
);
ALTER TABLE public.portfolio_deletion_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portfolio_deletion_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_deletion_challenges TO service_role;

CREATE OR REPLACE FUNCTION public.create_portfolio_deletion_challenge(p_user_id UUID, p_session_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE item public.portfolio_deletion_challenges%ROWTYPE;
BEGIN
  DELETE FROM public.portfolio_deletion_challenges WHERE expires_at < clock_timestamp() OR user_id = p_user_id;
  INSERT INTO public.portfolio_deletion_challenges(user_id, original_session_id) VALUES(p_user_id, p_session_id) RETURNING * INTO item;
  RETURN jsonb_build_object('challengeId', item.id, 'expiresAt', item.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_portfolio_deletion_challenge(
  p_user_id UUID, p_challenge_id UUID, p_session_id UUID, p_oauth_at BIGINT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.portfolio_deletion_challenges SET consumed_at = clock_timestamp()
    WHERE id = p_challenge_id AND user_id = p_user_id AND consumed_at IS NULL AND expires_at > clock_timestamp()
      AND original_session_id <> p_session_id AND p_oauth_at >= floor(extract(epoch FROM created_at))
      AND p_oauth_at <= extract(epoch FROM clock_timestamp()) + 30;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.portfolio_scan_status(UUID), public.reserve_portfolio_scan(UUID, UUID, INTEGER, INTEGER),
  public.start_portfolio_scan(UUID, UUID), public.fail_portfolio_scan(UUID, UUID), public.persist_portfolio_scan(UUID, UUID, JSONB),
  public.create_portfolio_deletion_challenge(UUID, UUID), public.consume_portfolio_deletion_challenge(UUID, UUID, UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portfolio_scan_status(UUID), public.reserve_portfolio_scan(UUID, UUID, INTEGER, INTEGER),
  public.start_portfolio_scan(UUID, UUID), public.fail_portfolio_scan(UUID, UUID), public.persist_portfolio_scan(UUID, UUID, JSONB),
  public.create_portfolio_deletion_challenge(UUID, UUID), public.consume_portfolio_deletion_challenge(UUID, UUID, UUID, BIGINT)
  TO service_role;
COMMIT;
