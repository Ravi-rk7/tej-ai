export const PERIODS = ["morning", "night"];
export const parseLocalDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.toISOString().slice(0, 10) === value ? date : null;
};
export const addLocalDays = (value, days) => {
  const date = parseLocalDate(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
export const safeTimestamp = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
    value,
  ) &&
  parseLocalDate(value.slice(0, 10)) &&
  Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
const integer = (value, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= 0 && value <= max;
const timezone = (value) => {
  if (typeof value !== "string" || value.length > 100) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return null;
  }
};

export const normalizeActivity = (raw, today, trackingStartedOn) => {
  if (
    ![13, 26, 53].includes(raw?.weeks) ||
    raw.weekStartsOn !== "sunday" ||
    !parseLocalDate(today) ||
    !parseLocalDate(trackingStartedOn)
  )
    return null;
  const startDate = addLocalDays(
    today,
    -parseLocalDate(today).getUTCDay() - (raw.weeks - 1) * 7,
  );
  const endDate = addLocalDays(startDate, raw.weeks * 7 - 1);
  if (raw.startDate !== startDate || raw.endDate !== endDate) return null;
  const source = new Map();
  for (const day of Array.isArray(raw.days) ? raw.days : []) {
    if (!parseLocalDate(day?.date)) continue;
    source.set(day.date, source.has(day.date) ? null : day);
  }
  const days = Array.from({ length: raw.weeks * 7 }, (_, index) => {
    const date = addLocalDays(startDate, index);
    const item = source.get(date);
    const known =
      item &&
      PERIODS.every((period) => typeof item.periods?.[period] === "boolean");
    const count = known
      ? PERIODS.filter((period) => item.periods[period]).length
      : null;
    const expectedState =
      date > today
        ? "future"
        : date < trackingStartedOn
          ? "untracked"
          : count === 2
            ? "complete"
            : count === 1
              ? "partial"
              : "missed";
    const valid =
      known &&
      item.state === expectedState &&
      item.completedCount === count &&
      item.level ===
        (["future", "untracked"].includes(expectedState) ? 0 : count * 2) &&
      (!["future", "untracked"].includes(expectedState) || count === 0);
    return {
      date,
      state: valid ? expectedState : "unknown",
      level: valid ? item.level : 0,
      completedCount: valid ? count : null,
      perfectDay: valid && count === 2,
      isToday: date === today,
      periods: valid
        ? { morning: item.periods.morning, night: item.periods.night }
        : { morning: null, night: null },
    };
  });
  return { weeks: raw.weeks, weekStartsOn: "sunday", startDate, endDate, days };
};

const normalizeAdherence = (value, days) => {
  if (
    !integer(value?.possible, days * 2) ||
    !integer(value?.completed, value.possible)
  )
    return null;
  return {
    completed: value.completed,
    possible: value.possible,
    percentage: value.possible
      ? Math.round((value.completed / value.possible) * 100)
      : null,
  };
};

export const normalizeRoutine = (raw) => {
  if (
    raw?.schemaVersion !== 1 ||
    !safeTimestamp(raw.generatedAt) ||
    typeof raw.preferences?.configured !== "boolean"
  )
    return null;
  if (!raw.preferences.configured)
    return {
      schemaVersion: 1,
      generatedAt: safeTimestamp(raw.generatedAt),
      preferences: { configured: false },
      nextDayAt: null,
      today: null,
      activity: null,
      streak: null,
      adherence: null,
    };
  const date = raw.today?.date;
  const started = raw.preferences.trackingStartedOn;
  const zone = timezone(raw.preferences.timezone);
  const nextDayAt = safeTimestamp(raw.nextDayAt);
  if (
    !parseLocalDate(date) ||
    !parseLocalDate(started) ||
    !zone ||
    !nextDayAt ||
    Date.parse(nextDayAt) <= Date.parse(raw.generatedAt)
  )
    return null;
  const periods = {};
  for (const period of PERIODS) {
    const item = raw.today.periods?.[period];
    if (
      typeof item?.completed !== "boolean" ||
      typeof item.enabled !== "boolean" ||
      (item.completed && !safeTimestamp(item.completedAt))
    )
      return null;
    periods[period] = {
      enabled: item.enabled,
      completed: item.completed,
      completedAt: item.completed ? safeTimestamp(item.completedAt) : null,
    };
  }
  const count = PERIODS.filter((period) => periods[period].completed).length;
  const streak = raw.streak;
  const validStreak =
    integer(streak?.current) &&
    integer(streak?.longest) &&
    streak.longest >= streak.current &&
    ["active", "at_risk", "inactive"].includes(streak.state) &&
    streak.atRisk === (streak.state === "at_risk") &&
    streak.qualifiesToday === count > 0 &&
    (streak.state === "active"
      ? count > 0 && streak.current > 0
      : streak.state === "at_risk"
        ? count === 0 && streak.current > 0
        : count === 0 && streak.current === 0);
  return {
    schemaVersion: 1,
    generatedAt: safeTimestamp(raw.generatedAt),
    nextDayAt,
    preferences: {
      configured: true,
      timezone: zone,
      trackingStartedOn: started,
      checkinsResumeAt: safeTimestamp(raw.preferences.checkinsResumeAt),
    },
    today: { date, completedCount: count, scheduledCount: 2, periods },
    streak: validStreak
      ? {
          current: streak.current,
          longest: streak.longest,
          state: streak.state,
          atRisk: streak.atRisk,
          qualifiesToday: streak.qualifiesToday,
        }
      : null,
    adherence: {
      last7Days: normalizeAdherence(raw.adherence?.last7Days, 7),
      last30Days: normalizeAdherence(raw.adherence?.last30Days, 30),
    },
    activity: normalizeActivity(raw.activity, date, started),
  };
};

export const streakCopy = (streak) =>
  !streak
    ? "Streak information is unavailable."
    : streak.state === "active"
      ? `${streak.current}-day routine streak`
      : streak.state === "at_risk"
        ? `Complete one routine today to keep your ${streak.current}-day streak.`
        : "Complete a routine to start a new streak.";

export const monthLabels = (days) => {
  const labels = [];
  let previous = null;
  days.forEach((day, index) => {
    const parsed = parseLocalDate(day.date);
    if (!parsed) return;
    const month = day.date.slice(0, 7);
    if (month !== previous) {
      const naturalColumn = Math.floor(index / 7);
      const column = labels.some((label) => label.column === naturalColumn)
        ? naturalColumn + 1
        : naturalColumn;
      if (
        column < Math.ceil(days.length / 7) &&
        !labels.some((label) => label.column === column)
      )
        labels.push({
          column,
          label: parsed.toLocaleDateString("en-US", {
            month: "short",
            timeZone: "UTC",
          }),
          key: month,
        });
      previous = month;
    }
  });
  return labels;
};

export const dayLabel = (day) => {
  const date =
    parseLocalDate(day.date)?.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }) || "Unknown date";
  const state =
    {
      future: "Future date",
      untracked: "Before routine tracking began",
      unknown: "Information unavailable",
      missed: "No check-in recorded",
      partial: "Partial",
      complete: "Perfect day",
    }[day.state] || "Information unavailable";
  const periods = ["partial", "complete", "missed"].includes(day.state)
    ? ` · Morning ${day.periods.morning ? "complete" : "not recorded"} · Night ${day.periods.night ? "complete" : "not recorded"}`
    : "";
  return `${date} · ${state}${periods}${day.isToday ? " · Today" : ""}`;
};

export const calendarFocusIndex = (index, key, ctrl, length, todayIndex) => {
  const offsets = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
  if (Object.hasOwn(offsets, key))
    return Math.max(0, Math.min(todayIndex, index + offsets[key]));
  if (key === "Home") return ctrl ? 0 : Math.floor(index / 7) * 7;
  if (key === "End")
    return ctrl
      ? todayIndex
      : Math.min(todayIndex, length - 1, Math.floor(index / 7) * 7 + 6);
  return index;
};

// Optimism applies only to the pressed control. Statistics remain server-owned.
export const optimisticRoutine = (state, period, completed) => ({
  ...state,
  today: {
    ...state.today,
    periods: {
      ...state.today.periods,
      [period]: { ...state.today.periods[period], completed },
    },
    completedCount: PERIODS.filter((key) =>
      key === period ? completed : state.today.periods[key].completed,
    ).length,
  },
});

// A single queue serializes distinct controls and ignores duplicate pending presses.
export const createRoutineMutationQueue = ({
  getState,
  setState,
  mutate,
  reconcile,
  onPending,
  onMessage,
}) => {
  let queue = Promise.resolve();
  const pending = new Set();
  return (period) => {
    if (pending.has(period)) return queue;
    pending.add(period);
    onPending([...pending]);
    queue = queue
      .then(async () => {
        const snapshot = getState();
        if (!snapshot?.today) return;
        const completed = !snapshot.today.periods[period].completed;
        setState(optimisticRoutine(snapshot, period, completed));
        try {
          const result = await mutate(period, completed);
          const canonical = normalizeRoutine(result);
          if (!canonical?.today || !canonical.activity || !canonical.streak)
            throw new Error("Invalid response");
          setState(canonical);
          onMessage(
            `${period === "morning" ? "Morning" : "Night"} routine ${completed ? "recorded" : "removed"}.`,
          );
        } catch (error) {
          setState(snapshot);
          onMessage(
            error?.status === 401
              ? "Your session expired. Please sign in again."
              : "Could not save your routine. Your previous state has been restored.",
          );
        } finally {
          try {
            await reconcile();
          } catch {
            /* A failed refresh must not poison the mutation queue. */
          }
        }
      })
      .finally(() => {
        pending.delete(period);
        onPending([...pending]);
      });
    return queue;
  };
};
