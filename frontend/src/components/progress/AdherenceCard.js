import styles from "./progress.module.css";
export default function AdherenceCard({ adherence }) {
  return (
    <article className={styles.card}>
      <h2 className={styles.heading}>Routine consistency</h2>
      <div className={styles.row}>
        {[7, 30].map((days) => {
          const value = adherence?.[`last${days}Days`];
          return (
            <div key={days} style={{ flex: 1 }}>
              <p className={styles.muted}>Last {days} days</p>
              <p className={styles.big}>
                {value?.percentage == null ? "—" : `${value.percentage}%`}
              </p>
              <p className={styles.muted}>
                {value
                  ? `${value.completed} of ${value.possible} routines recorded`
                  : "Information unavailable"}
              </p>
            </div>
          );
        })}
      </div>
      <p className={styles.muted} style={{ marginTop: 12 }}>
        Counts morning and night from the day tracking began, including today.
      </p>
    </article>
  );
}
