import { streakCopy } from "@/lib/routineData";
import styles from "./progress.module.css";
export default function StreakSummaryCard({ streak }) {
  return (
    <article className={styles.card}>
      <h2 className={styles.heading}>Routine streak</h2>
      <p className={styles.big}>
        {streak
          ? `${streak.current} ${streak.current === 1 ? "day" : "days"}`
          : "—"}
      </p>
      <p className={styles.muted}>{streakCopy(streak)}</p>
      <p className={styles.muted} style={{ marginTop: 12 }}>
        Longest streak: {streak ? `${streak.longest} days` : "unavailable"}
      </p>
    </article>
  );
}
