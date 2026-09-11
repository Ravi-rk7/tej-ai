"use client";
import { useEffect, useId, useRef, useState } from "react";
import { calendarFocusIndex, dayLabel, monthLabels } from "@/lib/routineData";
import styles from "./progress.module.css";

const symbols = {
  complete: "✓",
  partial: "·",
  missed: "",
  untracked: "",
  future: "",
  unknown: "?",
};
export default function ContributionHeatmap({ activity }) {
  const scroll = useRef(null);
  const id = useId();
  const [focusDate, setFocusDate] = useState(null);
  const [tooltipDate, setTooltipDate] = useState(null);
  const days = activity?.days || [];
  const todayIndex = days.findIndex((day) => day.isToday);
  const activeIndex = Math.max(
    0,
    days.findIndex((day) => day.date === focusDate) >= 0
      ? days.findIndex((day) => day.date === focusDate)
      : todayIndex,
  );
  const tooltipDay = days.find((day) => day.date === tooltipDate);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollLeft = scroll.current.scrollWidth;
  }, [activity?.startDate]);
  const focus = (index) => {
    const cell = scroll.current?.querySelector(`[data-index="${index}"]`);
    cell?.focus({ preventScroll: true });
    cell?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "instant",
    });
  };
  if (!activity)
    return (
      <article className={styles.card}>
        <h2 className={styles.heading}>Routine calendar</h2>
        <p className={styles.muted}>Calendar information is unavailable.</p>
      </article>
    );
  const columns = `repeat(${activity.weeks}, 12px)`;
  return (
    <article className={styles.card} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.heading}>
        Your routine, day by day
      </h2>
      <p className={styles.muted}>
        One routine keeps your streak going. Both make a perfect day.
      </p>
      <p id={`${id}-help`} className="sr-only">
        {days.filter((day) => day.completedCount > 0).length} recorded days in{" "}
        {activity.weeks} weeks. Use Left and Right to move a week, Up and Down
        to move a day, Home and End within a week. Control Home goes to the
        first date; Control End goes to today.
      </p>
      <div className={styles.calendarShell}>
        <div className={styles.weekdays} aria-hidden="true">
          <span style={{ gridRow: 3 }}>Mon</span>
          <span style={{ gridRow: 5 }}>Wed</span>
          <span style={{ gridRow: 7 }}>Fri</span>
        </div>
        <div
          ref={scroll}
          className={styles.scroll}
          data-testid="routine-calendar-scroll"
        >
          <div
            aria-hidden="true"
            className={styles.months}
            style={{
              gridTemplateColumns: columns,
              columnGap: 3,
              width: "max-content",
            }}
          >
            {monthLabels(days).map((month) => (
              <span key={month.key} style={{ gridColumn: month.column + 1 }}>
                {month.label}
              </span>
            ))}
          </div>
          <div
            className={styles.grid}
            style={{ gridTemplateColumns: columns }}
            role="grid"
            aria-label="Routine activity calendar"
            aria-describedby={`${id}-help`}
            aria-rowcount={7}
            aria-colcount={activity.weeks}
          >
            {Array.from({ length: 7 }, (_, weekday) => (
              <div
                key={weekday}
                role="row"
                aria-rowindex={weekday + 1}
                className={styles.gridRow}
              >
                {days.map((day, index) => {
                  if (index % 7 !== weekday) return null;
                  const Cell = day.state === "future" ? "span" : "button";
                  return (
                    <Cell
                      key={day.date}
                      type={day.state === "future" ? undefined : "button"}
                      role="gridcell"
                      className={styles.cell}
                      style={{
                        gridColumn: Math.floor(index / 7) + 1,
                        gridRow: weekday + 1,
                      }}
                      data-index={index}
                      data-state={day.state}
                      data-today={day.isToday}
                      aria-colindex={Math.floor(index / 7) + 1}
                      aria-label={dayLabel(day)}
                      aria-current={day.isToday ? "date" : undefined}
                      aria-disabled={day.state === "future" || undefined}
                      tabIndex={
                        day.state !== "future" && index === activeIndex ? 0 : -1
                      }
                      aria-describedby={
                        tooltipDate === day.date ? `${id}-tooltip` : undefined
                      }
                      onFocus={() => {
                        setFocusDate(day.date);
                        setTooltipDate(day.date);
                      }}
                      onMouseEnter={() => setTooltipDate(day.date)}
                      onMouseLeave={() => setTooltipDate(null)}
                      onBlur={() => setTooltipDate(null)}
                      onClick={() => {
                        if (day.state !== "future") {
                          setTooltipDate(day.date);
                          focus(index);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setTooltipDate(null);
                          return;
                        }
                        if (
                          ![
                            "ArrowLeft",
                            "ArrowRight",
                            "ArrowUp",
                            "ArrowDown",
                            "Home",
                            "End",
                          ].includes(event.key)
                        )
                          return;
                        event.preventDefault();
                        focus(
                          calendarFocusIndex(
                            index,
                            event.key,
                            event.ctrlKey || event.metaKey,
                            days.length,
                            todayIndex,
                          ),
                        );
                      }}
                    >
                      <span aria-hidden="true">{symbols[day.state]}</span>
                    </Cell>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className={styles.muted}>Swipe to see earlier days.</p>
      <div className={styles.legend} aria-label="Calendar legend">
        {[
          ["untracked", "Before tracking"],
          ["missed", "No check-in"],
          ["partial", "One routine"],
          ["complete", "Perfect day"],
        ].map(([state, label]) => (
          <span key={state} className={styles.legendItem}>
            <span className={styles.cell} data-state={state} aria-hidden="true">
              {symbols[state]}
            </span>
            {label}
          </span>
        ))}
      </div>
      <div className={styles.tooltip} role="tooltip" id={`${id}-tooltip`}>
        {tooltipDay
          ? dayLabel(tooltipDay)
          : "Hover, focus, or tap a date to see its routines."}
      </div>
    </article>
  );
}
