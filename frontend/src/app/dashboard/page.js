"use client";

import AppLayout from "@/components/layout/AppLayout";

const scoreHistory = [
    { date: "Apr 10, 2026", score: 68 },
    { date: "Apr 14, 2026", score: 72 },
    { date: "Apr 18, 2026", score: 75 },
    { date: "Apr 22, 2026", score: 78 },
];

function HistoryGraph({ entries }) {
    const maxScore = 100;

    return (
        <article
            className="rounded-[28px] p-6 md:p-7"
            style={{
                background: "#fff",
                border: "1px solid rgba(200,196,214,0.45)",
                boxShadow: "0 16px 40px -25px rgba(26,25,48,0.15)",
            }}
        >
            <div className="flex items-center justify-between gap-3 mb-6">
                <h2
                    className="text-2xl font-black"
                    style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                    Glow Score History
                </h2>
                <span
                    className="rounded-full px-3 py-1.5 text-xs font-semibold"
                    style={{ background: "#e4dfff", color: "#5845cb", fontFamily: "'Inter', sans-serif" }}
                >
                    3 day streak 🔥
                </span>
            </div>

            <div className="grid grid-cols-4 gap-3 md:gap-4 items-end h-44 md:h-48">
                {entries.map((entry, index) => {
                    const heightPercent = Math.max(14, (entry.score / maxScore) * 100);
                    const isLatest = index === entries.length - 1;

                    return (
                        <div key={entry.date} className="flex flex-col items-center gap-2 h-full justify-end">
                            <div
                                className="w-full max-w-19 rounded-t-2xl"
                                style={{
                                    height: `${heightPercent}%`,
                                    minHeight: 28,
                                    background: isLatest
                                        ? "linear-gradient(180deg, #5845cb 0%, #a88bff 100%)"
                                        : "linear-gradient(180deg, #cdc5fb 0%, #e8ddff 100%)",
                                    opacity: 0,
                                    animation: `fade-up 0.55s ease-out ${0.12 * index}s forwards`,
                                }}
                                aria-hidden="true"
                            />
                            <p
                                className="text-xs text-center leading-tight"
                                style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}
                            >
                                {entry.date.replace(", 2026", "")}
                            </p>
                        </div>
                    );
                })}
            </div>
        </article>
    );
}

function EmptyState() {
    return (
        <article
            className="rounded-[28px] p-8 md:p-10 text-center"
            style={{
                background: "#fff",
                border: "1px solid rgba(200,196,214,0.45)",
                boxShadow: "0 16px 38px -25px rgba(26,25,48,0.15)",
            }}
        >
            <h2
                className="text-2xl font-black"
                style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
                No scans yet
            </h2>
            <p
                className="mt-3 text-base"
                style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
            >
                Start your first scan to see your glow score history and skin progress.
            </p>

            <a
                href="/scan"
                className="inline-flex mt-6 rounded-full px-6 py-3.5 text-sm font-bold"
                style={{
                    background: "linear-gradient(135deg, #5845cb 0%, #a88bff 100%)",
                    color: "#fff",
                    textDecoration: "none",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    boxShadow: "0 14px 32px -16px rgba(88,69,203,0.55)",
                }}
            >
                Start your first scan
            </a>
        </article>
    );
}

function ScoreHistoryCards({ entries }) {
    const latestIndex = entries.length - 1;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            {entries.map((entry, index) => {
                const isLatest = index === latestIndex;

                return (
                    <article
                        key={entry.date}
                        className="rounded-3xl p-5 md:p-6"
                        style={{
                            background: isLatest ? "linear-gradient(135deg, #5845cb 0%, #a88bff 100%)" : "#fff",
                            border: isLatest ? "1px solid rgba(88,69,203,0.55)" : "1px solid rgba(200,196,214,0.45)",
                            boxShadow: isLatest
                                ? "0 18px 42px -22px rgba(88,69,203,0.55)"
                                : "0 12px 30px -24px rgba(26,25,48,0.22)",
                            opacity: 0,
                            transform: "translateY(14px)",
                            animation: `fade-up 0.55s ease-out ${0.1 * index + 0.2}s forwards`,
                            transition: "transform 0.2s ease, box-shadow 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-4px)";
                            if (isLatest) {
                                e.currentTarget.style.boxShadow = "0 20px 52px -20px rgba(88,69,203,0.62)";
                            } else {
                                e.currentTarget.style.boxShadow = "0 18px 38px -20px rgba(26,25,48,0.20)";
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                            if (isLatest) {
                                e.currentTarget.style.boxShadow = "0 18px 42px -22px rgba(88,69,203,0.55)";
                            } else {
                                e.currentTarget.style.boxShadow = "0 12px 30px -24px rgba(26,25,48,0.22)";
                            }
                        }}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p
                                    className="text-xs font-semibold uppercase tracking-[0.15em]"
                                    style={{
                                        color: isLatest ? "rgba(255,255,255,0.82)" : "#787585",
                                        fontFamily: "'Inter', sans-serif",
                                    }}
                                >
                                    {isLatest ? "Latest" : "Scan"}
                                </p>
                                <h3
                                    className="mt-2 text-xl font-bold"
                                    style={{
                                        color: isLatest ? "#fff" : "#1a1930",
                                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    }}
                                >
                                    {entry.date}
                                </h3>
                            </div>

                            <div className="text-right">
                                <p
                                    className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                                    style={{
                                        color: isLatest ? "rgba(255,255,255,0.78)" : "#787585",
                                        fontFamily: "'Inter', sans-serif",
                                    }}
                                >
                                    Glow Score
                                </p>
                                <p
                                    className="text-4xl font-black leading-none mt-1"
                                    style={{
                                        color: isLatest ? "#fff" : "#5845cb",
                                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    }}
                                >
                                    {entry.score}
                                </p>
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

export default function DashboardPage() {
    const hasHistory = scoreHistory.length > 0;

    return (
        <AppLayout>
            <div className="min-h-screen px-5 sm:px-8 lg:px-12 py-9 lg:py-11">
                <div className="mx-auto w-full max-w-6xl">
                    <header className="mb-7 md:mb-9">
                        <h1
                            className="text-4xl md:text-5xl font-black tracking-tight"
                            style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                        >
                            Your Skin Progress
                        </h1>
                    </header>

                    {hasHistory ? (
                        <>
                            <section className="mb-6 md:mb-7">
                                <HistoryGraph entries={scoreHistory} />
                            </section>

                            <section>
                                <ScoreHistoryCards entries={scoreHistory} />
                            </section>
                        </>
                    ) : (
                        <section>
                            <EmptyState />
                        </section>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
