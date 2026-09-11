"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeRoutinePeriod,
  getRoutineSummary,
  saveRoutineTimezone,
  undoRoutinePeriod,
} from "@/lib/api";
import {
  createRoutineMutationQueue,
  normalizeRoutine,
} from "@/lib/routineData";
import TodayRoutineCard from "./TodayRoutineCard";
import StreakSummaryCard from "./StreakSummaryCard";
import AdherenceCard from "./AdherenceCard";
import ContributionHeatmap from "./ContributionHeatmap";
import styles from "./progress.module.css";

function TimezoneSetup({ onSave, busy, message }) {
  const [zone, setZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  );
  return (
    <article className={styles.card}>
      <h2 className={styles.heading}>Start your routine streak</h2>
      <p className={styles.muted}>
        Confirm your timezone so each routine belongs to your local day. Morning
        and night are available every day.
      </p>
      <form
        className={styles.row}
        style={{ marginTop: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          onSave(zone);
        }}
      >
        <label className={styles.muted}>
          Your timezone{" "}
          <input
            className={styles.select}
            aria-label="Your timezone"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
            required
            maxLength={100}
            placeholder="Asia/Kolkata"
          />
        </label>
        <button
          type="submit"
          className={`${styles.button} ${styles.primary}`}
          disabled={busy}
          aria-busy={busy}
        >
          Start routine tracking
        </button>
      </form>
      <p role="status" aria-live="polite" className={styles.status}>
        {message}
      </p>
    </article>
  );
}

export default function RoutineProgressSection({ latestRoutinePath }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [pending, setPending] = useState([]);
  const [message, setMessage] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const current = useRef(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const request = useRef(null);
  const mutation = useRef(null);
  const enqueue = useRef(null);
  const commit = useCallback((value) => {
    if (mounted.current) {
      current.current = value;
      setData(value);
    }
  }, []);
  const load = useCallback(
    async (force = false) => {
      if (busy.current && !force) return;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      try {
        const result = normalizeRoutine(
          await getRoutineSummary({ signal: controller.signal }),
        );
        if (!result) throw new Error("Invalid summary");
        if (controller.signal.aborted || !mounted.current) return;
        commit(result);
        setStatus("success");
      } catch (error) {
        if (controller.signal.aborted || !mounted.current) return;
        setStatus("error");
        if (error.status === 401)
          setMessage("Your session expired. Please sign in again.");
      }
    },
    [commit],
  );
  useEffect(() => {
    mounted.current = true;
    enqueue.current = createRoutineMutationQueue({
      getState: () => (mounted.current ? current.current : null),
      setState: commit,
      mutate: (period, completed) => {
        request.current?.abort();
        mutation.current = new AbortController();
        return (completed ? completeRoutinePeriod : undoRoutinePeriod)(period, {
          signal: mutation.current.signal,
        });
      },
      reconcile: () => load(true),
      onPending: (items) => {
        busy.current = items.length > 0;
        if (mounted.current) setPending(items);
      },
      onMessage: (text) => {
        if (mounted.current) setMessage(text);
      },
    });
    queueMicrotask(() => {
      if (mounted.current) void load();
    });
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      request.current?.abort();
      mutation.current?.abort();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [commit, load]);
  useEffect(() => {
    if (!data?.nextDayAt) return;
    const generatedAt = Date.parse(data.generatedAt);
    const resumeAt = Date.parse(data.preferences.checkinsResumeAt);
    const refreshAt =
      resumeAt > generatedAt
        ? Math.min(resumeAt, Date.parse(data.nextDayAt))
        : Date.parse(data.nextDayAt);
    // Re-arm on the canonical response. Clamp long timers; visibility also refreshes.
    const timeout = setTimeout(
      () => void load(),
      Math.min(2147483647, Math.max(1000, refreshAt - generatedAt + 250)),
    );
    return () => clearTimeout(timeout);
  }, [
    data?.nextDayAt,
    data?.generatedAt,
    data?.preferences.checkinsResumeAt,
    load,
  ]);
  const setup = async (zone) => {
    if (busy.current) return;
    busy.current = true;
    setSettingUp(true);
    setMessage("");
    request.current?.abort();
    mutation.current = new AbortController();
    try {
      const result = normalizeRoutine(
        await saveRoutineTimezone(zone, { signal: mutation.current.signal }),
      );
      if (!result?.preferences.configured) throw new Error("Invalid setup");
      commit(result);
      if (mounted.current) setStatus("success");
      await load(true);
    } catch (error) {
      if (mounted.current)
        setMessage(
          error.status === 401
            ? "Your session expired. Please sign in again."
            : "Could not start tracking. Check your timezone and try again.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setSettingUp(false);
    }
  };
  return (
    <section className={styles.section} aria-label="Routine progress">
      {status === "loading" && (
        <div className={styles.skeleton} role="status">
          <span className="sr-only">Loading routine progress</span>
        </div>
      )}
      {status === "error" && (
        <div className={styles.card} role="alert">
          <h2 className={styles.heading}>Routine tracking unavailable</h2>
          <p className={styles.muted}>
            We could not refresh your routine data.
          </p>
          <button
            className={styles.button}
            onClick={() => void load()}
            type="button"
          >
            Retry routine tracking
          </button>
        </div>
      )}
      {data && !data.preferences.configured && (
        <TimezoneSetup onSave={setup} busy={settingUp} message={message} />
      )}
      {data?.preferences.configured && (
        <>
          <TodayRoutineCard
            today={data.today}
            preferences={data.preferences}
            generatedAt={data.generatedAt}
            pending={pending}
            onToggle={(period) => enqueue.current?.(period)}
            message={message}
            latestRoutinePath={latestRoutinePath}
          />
          <div className={styles.overview}>
            <StreakSummaryCard streak={data.streak} />
            <AdherenceCard adherence={data.adherence} />
          </div>
          <ContributionHeatmap activity={data.activity} />
        </>
      )}
    </section>
  );
}
