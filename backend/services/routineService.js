import { createClient } from "@supabase/supabase-js";
import env from "../config/env.js";

export const PERIODS = Object.freeze(["morning", "night"]);
export const ROUTINE_ERRORS = Object.freeze({
  ROUTINE_PERIOD_INVALID: [400, "Choose morning or night."],
  ROUTINE_PREFERENCES_INVALID: [400, "Choose a valid IANA timezone."],
  ROUTINE_RANGE_INVALID: [400, "Choose 13, 26, or 53 weeks."],
  ROUTINE_REQUEST_INVALID: [
    400,
    "Routine check-ins must have no request body or query.",
  ],
  ROUTINE_SETUP_REQUIRED: [
    409,
    "Confirm your timezone to start routine tracking.",
  ],
  ROUTINE_PERIOD_DISABLED: [409, "This routine period is disabled."],
  TIMEZONE_CHANGE_COOLDOWN: [
    409,
    "Timezone changes require 24 hours. After a change, check-ins resume when both local days have ended.",
  ],
  ROUTINE_UNAVAILABLE: [503, "Routine tracking is temporarily unavailable."],
});

export class RoutineError extends Error {
  constructor(code = "ROUTINE_UNAVAILABLE") {
    const [status, message] =
      ROUTINE_ERRORS[code] || ROUTINE_ERRORS.ROUTINE_UNAVAILABLE;
    super(message);
    this.publicCode = Object.hasOwn(ROUTINE_ERRORS, code)
      ? code
      : "ROUTINE_UNAVAILABLE";
    this.statusCode = status;
  }
}

export const parseCalendarDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const length = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= length
    ? { year, month, day }
    : null;
};

// Gregorian civil-date arithmetic. Epoch: 1970-01-01. No timestamp differences.
export const dayOrdinal = (value) => {
  const parsed = parseCalendarDate(value);
  if (!parsed) throw new RoutineError();
  const { month, day } = parsed;
  const year = parsed.year - (month <= 2 ? 1 : 0);
  const era = Math.floor(year / 400);
  const yoe = year - era * 400;
  const doy =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  return (
    era * 146097 +
    yoe * 365 +
    Math.floor(yoe / 4) -
    Math.floor(yoe / 100) +
    doy -
    719468
  );
};

export const addCalendarDays = (value, days) => {
  const parsed = parseCalendarDate(value);
  if (!parsed || !Number.isInteger(days)) throw new RoutineError();
  const date = new Date(0);
  date.setUTCFullYear(parsed.year, parsed.month - 1, parsed.day + days);
  return date.toISOString().slice(0, 10);
};

export const validateTimezone = (value) => {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    value !== value.trim() ||
    !/^(UTC|[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(value) ||
    /^(posix|right)\//.test(value)
  )
    return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

const ordinalsFor = (dates, today) =>
  [
    ...new Set(
      dates
        .filter((date) => parseCalendarDate(date) && (!today || date <= today))
        .map(dayOrdinal),
    ),
  ].sort((a, b) => a - b);

export const calculateLongestStreak = (dates, today) => {
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const ordinal of ordinalsFor(dates, today)) {
    run = previous === ordinal - 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = ordinal;
  }
  return longest;
};

export const calculateStreak = (dates, today) => {
  const days = new Set(ordinalsFor(dates, today));
  const currentDay = dayOrdinal(today);
  const qualifiesToday = days.has(currentDay);
  const atRisk = !qualifiesToday && days.has(currentDay - 1);
  let current = 0;
  if (qualifiesToday || atRisk) {
    for (
      let day = qualifiesToday ? currentDay : currentDay - 1;
      days.has(day);
      day -= 1
    )
      current += 1;
  }
  return {
    current,
    longest: calculateLongestStreak(dates),
    state: qualifiesToday ? "active" : atRisk ? "at_risk" : "inactive",
    atRisk,
    qualifiesToday,
  };
};

const checkinsByDate = (checkins) => {
  const result = new Map();
  for (const item of checkins) {
    if (!parseCalendarDate(item?.local_date) || !PERIODS.includes(item.period))
      continue;
    if (!result.has(item.local_date)) result.set(item.local_date, {});
    result.get(item.local_date)[item.period] = item;
  }
  return result;
};

export const calculateAdherence = ({
  checkins,
  today,
  trackingStartedOn,
  days,
}) => {
  const start = Math.max(
    dayOrdinal(trackingStartedOn),
    dayOrdinal(today) - days + 1,
  );
  const possible = Math.max(0, dayOrdinal(today) - start + 1) * 2;
  let completed = 0;
  for (const [date, periods] of checkinsByDate(checkins)) {
    if (dayOrdinal(date) >= start && date <= today)
      completed += Object.keys(periods).length;
  }
  return {
    completed,
    possible,
    percentage: possible ? Math.round((completed / possible) * 100) : null,
  };
};

export const buildHeatmap = ({
  today,
  trackingStartedOn,
  checkins = [],
  weeks = 53,
}) => {
  if (![13, 26, 53].includes(weeks))
    throw new RoutineError("ROUTINE_RANGE_INVALID");
  const weekday = (((dayOrdinal(today) + 4) % 7) + 7) % 7;
  const startDate = addCalendarDays(today, -weekday - (weeks - 1) * 7);
  const byDate = checkinsByDate(checkins);
  const days = Array.from({ length: weeks * 7 }, (_, index) => {
    const date = addCalendarDays(startDate, index);
    const periods = {
      morning: Boolean(byDate.get(date)?.morning),
      night: Boolean(byDate.get(date)?.night),
    };
    const completedCount = Number(periods.morning) + Number(periods.night);
    const state =
      date > today
        ? "future"
        : date < trackingStartedOn
          ? "untracked"
          : completedCount === 2
            ? "complete"
            : completedCount === 1
              ? "partial"
              : "missed";
    return {
      date,
      state,
      level: ["future", "untracked"].includes(state) ? 0 : completedCount * 2,
      completedCount,
      perfectDay: completedCount === 2,
      isToday: date === today,
      periods,
    };
  });
  return {
    weekStartsOn: "sunday",
    weeks,
    startDate,
    endDate: days.at(-1).date,
    days,
  };
};

const timestamp = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;

export const serializeRoutine = (
  snapshot,
  { weeks = 53, mutation = false } = {},
) => {
  const generatedAt = timestamp(snapshot?.generated_at);
  if (!generatedAt) throw new RoutineError();
  const preferences = snapshot.preferences;
  if (!preferences)
    return {
      schemaVersion: 1,
      generatedAt,
      nextDayAt: null,
      preferences: {
        configured: false,
        timezone: null,
        trackingStartedOn: null,
        checkinsResumeAt: null,
      },
      today: null,
      streak: {
        current: 0,
        longest: 0,
        state: "inactive",
        atRisk: false,
        qualifiesToday: false,
      },
      adherence: {
        last7Days: { completed: 0, possible: 0, percentage: null },
        last30Days: { completed: 0, possible: 0, percentage: null },
      },
      activity: null,
    };
  const date = snapshot.today_date;
  if (
    !parseCalendarDate(date) ||
    !parseCalendarDate(preferences.tracking_started_on) ||
    !validateTimezone(preferences.timezone) ||
    !timestamp(snapshot.next_day_at) ||
    !Array.isArray(snapshot.checkins) ||
    !Array.isArray(snapshot.qualifying_dates)
  )
    throw new RoutineError();
  const checkins = snapshot.checkins;
  const todayCheckins = checkinsByDate(checkins).get(date) || {};
  const periods = Object.fromEntries(
    PERIODS.map((period) => [
      period,
      {
        enabled: preferences[`${period}_enabled`] === true,
        completed: Boolean(todayCheckins[period]),
        completedAt: timestamp(todayCheckins[period]?.completed_at),
      },
    ]),
  );
  const activity = buildHeatmap({
    today: date,
    trackingStartedOn: preferences.tracking_started_on,
    checkins,
    weeks,
  });
  const response = {
    schemaVersion: 1,
    generatedAt,
    nextDayAt: timestamp(snapshot.next_day_at),
    preferences: {
      configured: true,
      timezone: preferences.timezone,
      trackingStartedOn: preferences.tracking_started_on,
      checkinsResumeAt: timestamp(preferences.checkins_resume_at),
    },
    today: {
      date,
      completedCount: PERIODS.filter((period) => periods[period].completed)
        .length,
      scheduledCount: 2,
      periods,
    },
    streak: calculateStreak(snapshot.qualifying_dates, date),
    adherence: Object.fromEntries(
      [7, 30].map((days) => [
        `last${days}Days`,
        calculateAdherence({
          checkins,
          today: date,
          trackingStartedOn: preferences.tracking_started_on,
          days,
        }),
      ]),
    ),
    activity,
  };
  if (mutation)
    response.changedDay = activity.days.find((day) => day.date === date);
  if (typeof snapshot.deleted === "boolean")
    response.deleted = snapshot.deleted;
  if (snapshot.completion)
    response.completion = {
      period: snapshot.completion.period,
      localDate: snapshot.completion.localDate,
      timezone: snapshot.completion.timezone,
      completedAt: timestamp(snapshot.completion.completedAt),
    };
  return response;
};

export const createRoutineRepository = ({ databaseClient } = {}) => {
  let client = databaseClient;
  const rpc = async (name, args) => {
    try {
      client ||= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.rpc(name, args);
      if (error) throw error;
      if (!data) throw new RoutineError();
      return data;
    } catch (error) {
      // Match exact known database exceptions; never return provider messages.
      throw new RoutineError(
        Object.hasOwn(ROUTINE_ERRORS, error.message)
          ? error.message
          : undefined,
      );
    }
  };
  return {
    summary: (userId, weeks) =>
      rpc("get_routine_activity", { p_user_id: userId, p_weeks: weeks }),
    preferences: (userId, timezone) =>
      rpc("set_user_progress_preferences", {
        p_user_id: userId,
        p_timezone: timezone,
      }),
    complete: (userId, period) =>
      rpc("complete_today_routine_period", {
        p_user_id: userId,
        p_period: period,
      }),
    undo: (userId, period) =>
      rpc("uncomplete_today_routine_period", {
        p_user_id: userId,
        p_period: period,
      }),
  };
};

export const createRoutineService = ({
  repository = createRoutineRepository(),
} = {}) => ({
  summary: async (userId, weeks) =>
    serializeRoutine(await repository.summary(userId, weeks), { weeks }),
  preferences: async (userId, timezone) =>
    serializeRoutine(await repository.preferences(userId, timezone), {
      mutation: true,
    }),
  complete: async (userId, period) =>
    serializeRoutine(await repository.complete(userId, period), {
      mutation: true,
    }),
  undo: async (userId, period) =>
    serializeRoutine(await repository.undo(userId, period), { mutation: true }),
});
