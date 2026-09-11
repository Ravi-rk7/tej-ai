-- Routine dates are server-owned. Never apply automatically to a remote DB.
BEGIN;

CREATE FUNCTION public.is_routine_timezone(p_timezone TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
    SELECT p_timezone IS NOT NULL AND length(p_timezone) <= 100
        AND (p_timezone = 'UTC' OR p_timezone LIKE '%/%')
        AND p_timezone NOT LIKE 'posix/%' AND p_timezone NOT LIKE 'right/%'
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_timezone);
$$;

CREATE TABLE public.user_progress_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    timezone TEXT NOT NULL CHECK (public.is_routine_timezone(timezone)),
    tracking_started_on DATE NOT NULL,
    morning_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    night_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    timezone_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Travel guard survives undo without retaining deleted check-in records.
    checkins_resume_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT routine_at_least_one_period CHECK (morning_enabled OR night_enabled)
);

CREATE TABLE public.routine_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    local_date DATE NOT NULL,
    period TEXT NOT NULL CHECK (period IN ('morning', 'night')),
    timezone TEXT NOT NULL CHECK (public.is_routine_timezone(timezone)),
    completed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, local_date, period),
    CONSTRAINT routine_local_date_invariant CHECK (
        local_date = (completed_at AT TIME ZONE timezone)::date
    )
);
CREATE INDEX routine_checkins_user_date_idx ON public.routine_checkins (user_id, local_date DESC);

ALTER TABLE public.user_progress_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.routine_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_checkins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_progress_preferences, public.routine_checkins FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_progress_preferences, public.routine_checkins TO service_role;

-- Internal snapshot receives the one captured time from the locked caller.
-- Only distinct dates from older history cross the database boundary.
CREATE FUNCTION public._routine_snapshot(p_user_id UUID, p_now TIMESTAMPTZ, p_weeks INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE
    v_preferences public.user_progress_preferences%ROWTYPE;
    v_today DATE;
    v_start DATE;
BEGIN
    IF p_weeks IS NULL OR p_weeks NOT IN (13, 26, 53) THEN
        RAISE EXCEPTION 'ROUTINE_RANGE_INVALID';
    END IF;
    SELECT * INTO v_preferences FROM public.user_progress_preferences WHERE user_id = p_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('generated_at', p_now, 'preferences', NULL);
    END IF;
    v_today := (p_now AT TIME ZONE v_preferences.timezone)::date;
    v_start := v_today - extract(dow FROM v_today)::integer - (p_weeks - 1) * 7;
    RETURN jsonb_build_object(
        'generated_at', p_now,
        'today_date', v_today,
        'next_day_at', (v_today + 1)::timestamp AT TIME ZONE v_preferences.timezone,
        'preferences', jsonb_build_object(
            'timezone', v_preferences.timezone,
            'tracking_started_on', v_preferences.tracking_started_on,
            'morning_enabled', v_preferences.morning_enabled,
            'night_enabled', v_preferences.night_enabled,
            'checkins_resume_at', v_preferences.checkins_resume_at
        ),
        'qualifying_dates', COALESCE((
            SELECT jsonb_agg(local_date ORDER BY local_date) FROM (
                SELECT DISTINCT local_date FROM public.routine_checkins
                WHERE user_id = p_user_id
            ) dates
        ), '[]'::jsonb),
        'checkins', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'local_date', local_date, 'period', period,
                'timezone', timezone, 'completed_at', completed_at
            ) ORDER BY local_date, period)
            FROM public.routine_checkins
            WHERE user_id = p_user_id AND local_date BETWEEN v_start AND v_today
        ), '[]'::jsonb)
    );
END;
$$;

CREATE FUNCTION public.set_user_progress_preferences(p_user_id UUID, p_timezone TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE
    v_now TIMESTAMPTZ;
    v_preferences public.user_progress_preferences%ROWTYPE;
    v_resume TIMESTAMPTZ;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('routine:' || p_user_id::text, 0));
    v_now := clock_timestamp();
    IF NOT public.is_routine_timezone(p_timezone) THEN
        RAISE EXCEPTION 'ROUTINE_PREFERENCES_INVALID';
    END IF;
    SELECT * INTO v_preferences FROM public.user_progress_preferences WHERE user_id = p_user_id;
    IF NOT FOUND THEN
        INSERT INTO public.user_progress_preferences
            (user_id, timezone, tracking_started_on, timezone_changed_at, created_at, updated_at)
        VALUES (p_user_id, p_timezone, (v_now AT TIME ZONE p_timezone)::date, v_now, v_now, v_now);
    ELSIF v_preferences.timezone <> p_timezone THEN
        IF v_now < v_preferences.timezone_changed_at + interval '24 hours' THEN
            RAISE EXCEPTION 'TIMEZONE_CHANGE_COOLDOWN';
        END IF;
        v_resume := greatest(
            (((v_now AT TIME ZONE v_preferences.timezone)::date + 1)::timestamp AT TIME ZONE v_preferences.timezone),
            (((v_now AT TIME ZONE p_timezone)::date + 1)::timestamp AT TIME ZONE p_timezone)
        );
        UPDATE public.user_progress_preferences
        SET timezone = p_timezone, timezone_changed_at = v_now,
            checkins_resume_at = v_resume, updated_at = v_now
        WHERE user_id = p_user_id;
    END IF;
    RETURN public._routine_snapshot(p_user_id, v_now, 53);
END;
$$;

CREATE FUNCTION public.complete_today_routine_period(p_user_id UUID, p_period TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE
    v_now TIMESTAMPTZ;
    v_today DATE;
    v_preferences public.user_progress_preferences%ROWTYPE;
    v_completion JSONB;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('routine:' || p_user_id::text, 0));
    v_now := clock_timestamp();
    IF p_period IS NULL OR p_period NOT IN ('morning', 'night') THEN
        RAISE EXCEPTION 'ROUTINE_PERIOD_INVALID';
    END IF;
    SELECT * INTO v_preferences FROM public.user_progress_preferences WHERE user_id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ROUTINE_SETUP_REQUIRED'; END IF;
    IF (p_period = 'morning' AND NOT v_preferences.morning_enabled)
        OR (p_period = 'night' AND NOT v_preferences.night_enabled) THEN
        RAISE EXCEPTION 'ROUTINE_PERIOD_DISABLED';
    END IF;
    v_today := (v_now AT TIME ZONE v_preferences.timezone)::date;
    -- Existing completion remains idempotent, even during a travel pause.
    IF v_now < v_preferences.checkins_resume_at AND NOT EXISTS (
        SELECT 1 FROM public.routine_checkins
        WHERE user_id = p_user_id AND local_date = v_today AND period = p_period
    ) THEN RAISE EXCEPTION 'TIMEZONE_CHANGE_COOLDOWN'; END IF;
    INSERT INTO public.routine_checkins (user_id, local_date, period, timezone, completed_at, created_at)
    VALUES (p_user_id, v_today, p_period, v_preferences.timezone, v_now, v_now)
    ON CONFLICT (user_id, local_date, period) DO NOTHING;
    SELECT jsonb_build_object('period', period, 'localDate', local_date,
        'timezone', timezone, 'completedAt', completed_at)
    INTO v_completion FROM public.routine_checkins
    WHERE user_id = p_user_id AND local_date = v_today AND period = p_period;
    RETURN public._routine_snapshot(p_user_id, v_now, 53)
        || jsonb_build_object('completion', v_completion);
END;
$$;

CREATE FUNCTION public.uncomplete_today_routine_period(p_user_id UUID, p_period TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE
    v_now TIMESTAMPTZ;
    v_today DATE;
    v_preferences public.user_progress_preferences%ROWTYPE;
    v_deleted INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('routine:' || p_user_id::text, 0));
    v_now := clock_timestamp();
    IF p_period IS NULL OR p_period NOT IN ('morning', 'night') THEN
        RAISE EXCEPTION 'ROUTINE_PERIOD_INVALID';
    END IF;
    SELECT * INTO v_preferences FROM public.user_progress_preferences WHERE user_id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ROUTINE_SETUP_REQUIRED'; END IF;
    IF (p_period = 'morning' AND NOT v_preferences.morning_enabled)
        OR (p_period = 'night' AND NOT v_preferences.night_enabled) THEN
        RAISE EXCEPTION 'ROUTINE_PERIOD_DISABLED';
    END IF;
    v_today := (v_now AT TIME ZONE v_preferences.timezone)::date;
    DELETE FROM public.routine_checkins
    WHERE user_id = p_user_id AND local_date = v_today AND period = p_period;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN public._routine_snapshot(p_user_id, v_now, 53)
        || jsonb_build_object('deleted', v_deleted > 0);
END;
$$;

CREATE FUNCTION public.get_routine_activity(p_user_id UUID, p_weeks INTEGER DEFAULT 53)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE v_now TIMESTAMPTZ;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('routine:' || p_user_id::text, 0));
    v_now := clock_timestamp();
    RETURN public._routine_snapshot(p_user_id, v_now, p_weeks);
END;
$$;

CREATE FUNCTION public.get_routine_streak_stats(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE
    v_now TIMESTAMPTZ;
    v_snapshot JSONB;
    v_today DATE;
    v_stats JSONB;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('routine:' || p_user_id::text, 0));
    v_now := clock_timestamp();
    v_snapshot := public._routine_snapshot(p_user_id, v_now, 53);
    v_today := (v_snapshot->>'today_date')::date;
    WITH dates AS (
        SELECT value::date AS day FROM jsonb_array_elements_text(v_snapshot->'qualifying_dates')
    ), runs AS (
        SELECT day, day - row_number() OVER (ORDER BY day)::integer AS run FROM dates
    ), lengths AS (
        SELECT count(*) AS length, count(*) FILTER (WHERE day <= v_today) AS current_length,
            max(day) FILTER (WHERE day <= v_today) AS last_day FROM runs GROUP BY run
    )
    SELECT jsonb_build_object(
        'current', COALESCE(max(current_length) FILTER (WHERE last_day >= v_today - 1), 0),
        'longest', COALESCE(max(length), 0),
        'state', CASE WHEN EXISTS (SELECT 1 FROM dates WHERE day = v_today) THEN 'active'
            WHEN EXISTS (SELECT 1 FROM dates WHERE day = v_today - 1) THEN 'at_risk' ELSE 'inactive' END,
        'atRisk', NOT EXISTS (SELECT 1 FROM dates WHERE day = v_today)
            AND EXISTS (SELECT 1 FROM dates WHERE day = v_today - 1),
        'qualifiesToday', EXISTS (SELECT 1 FROM dates WHERE day = v_today)
    ) INTO v_stats FROM lengths;
    RETURN jsonb_build_object('generated_at', v_now, 'today_date', v_today, 'streak', v_stats);
END;
$$;

REVOKE ALL ON FUNCTION public.is_routine_timezone(TEXT),
    public._routine_snapshot(UUID, TIMESTAMPTZ, INTEGER),
    public.set_user_progress_preferences(UUID, TEXT),
    public.complete_today_routine_period(UUID, TEXT),
    public.uncomplete_today_routine_period(UUID, TEXT),
    public.get_routine_streak_stats(UUID), public.get_routine_activity(UUID, INTEGER)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_routine_timezone(TEXT),
    public._routine_snapshot(UUID, TIMESTAMPTZ, INTEGER),
    public.set_user_progress_preferences(UUID, TEXT),
    public.complete_today_routine_period(UUID, TEXT),
    public.uncomplete_today_routine_period(UUID, TEXT),
    public.get_routine_streak_stats(UUID), public.get_routine_activity(UUID, INTEGER)
TO service_role;

COMMIT;
