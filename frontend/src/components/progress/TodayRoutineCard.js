import Link from "next/link";
import styles from "./progress.module.css";

export default function TodayRoutineCard({
  today,
  preferences,
  pending,
  onToggle,
  message,
  latestRoutinePath,
  generatedAt,
}) {
  const paused =
    preferences.checkinsResumeAt &&
    Date.parse(preferences.checkinsResumeAt) > Date.parse(generatedAt);
  return (
    <article className={styles.card} aria-labelledby="today-routine-title">
      <div className={styles.row}>
        <h2 id="today-routine-title" className={styles.heading}>
          Today&apos;s routine
        </h2>
        <span className={styles.muted}>
          {today.date} · {preferences.timezone}
        </span>
      </div>
      <p className={styles.muted}>
        {today.completedCount} of 2 routines completed
      </p>
      <div className={styles.row} style={{ marginTop: 18 }}>
        {["morning", "night"].map((period) => (
          <button
            key={period}
            type="button"
            className={styles.button}
            aria-pressed={today.periods[period].completed}
            aria-busy={pending.includes(period)}
            disabled={
              pending.includes(period) ||
              !today.periods[period].enabled ||
              (paused && !today.periods[period].completed)
            }
            onClick={() => onToggle(period)}
          >
            {today.periods[period].completed ? "✓ " : "○ "}
            {period === "morning" ? "Morning" : "Night"} routine
            {pending.includes(period) ? " · Saving…" : ""}
          </button>
        ))}
        {latestRoutinePath && (
          <Link
            href={latestRoutinePath}
            className={styles.muted}
            style={{ textDecoration: "underline" }}
          >
            View latest routine
          </Link>
        )}
      </div>
      {!latestRoutinePath && (
        <p className={styles.muted} style={{ marginTop: 12 }}>
          You can track your existing routine. A scan is optional.
        </p>
      )}
      {paused && (
        <p className={styles.muted}>
          After your timezone change, new check-ins resume at{" "}
          {new Date(preferences.checkinsResumeAt).toLocaleString("en-US", {
            timeZone: preferences.timezone,
          })}{" "}
          ({preferences.timezone}).
        </p>
      )}
      <p role="status" aria-live="polite" className={styles.status}>
        {message}
      </p>
    </article>
  );
}
