"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";
import PaywallModal from "@/components/paywall/PaywallModal";
import { getHistory, isLimitError } from "@/lib/api";

/* ─── Format ISO date to human readable ─────────── */
function formatDate(isoString) {
    try {
        return new Date(isoString).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch {
        return isoString;
    }
}

/* ─── History Item Card ──────────────────────────── */
function HistoryCard({ item, index }) {
    return (
        <article
            key={item.date}
            className="rounded-2xl p-5"
            style={{
                background: "#fcf8ff",
                border: "1px solid rgba(200,196,214,0.45)",
                opacity: 0,
                animation: `fade-up 0.5s ease-out ${index * 0.1 + 0.1}s forwards`,
            }}
        >
            <p
                className="text-xs uppercase tracking-[0.14em] font-semibold"
                style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}
            >
                {formatDate(item.date)}
            </p>
            <p
                className="mt-3 text-4xl font-black"
                style={{ color: "#5845cb", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
                {item.glowScore}
            </p>
            {item.concerns?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.concerns.map((c) => (
                        <span
                            key={c}
                            className="text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={{
                                background: "rgba(228,223,255,0.6)",
                                color: "#5845cb",
                                fontFamily: "'Inter', sans-serif",
                            }}
                        >
                            {c}
                        </span>
                    ))}
                </div>
            )}
        </article>
    );
}

/* ─── Skeleton loader ────────────────────────────── */
function HistorySkeleton() {
    return (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    className="rounded-2xl p-5 h-28"
                    style={{ background: "rgba(200,196,214,0.25)" }}
                />
            ))}
        </div>
    );
}

/* ─── Empty state ────────────────────────────────── */
function EmptyHistory() {
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: "#f0edff" }}
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5845cb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
            </div>
            <p
                className="text-base font-semibold"
                style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
            >
                No scans yet. Complete your first scan to start tracking progress.
            </p>
        </div>
    );
}

/* ─── Error state ────────────────────────────────── */
function FetchError({ message, onRetry }) {
    return (
        <div
            className="mt-5 flex flex-col items-center gap-4 rounded-2xl p-6 text-center"
            style={{ background: "#fff0f0", border: "1px solid rgba(186,26,26,0.2)" }}
        >
            <p
                className="text-sm font-semibold"
                style={{ color: "#ba1a1a", fontFamily: "'Inter', sans-serif" }}
            >
                {message}
            </p>
            <button
                onClick={onRetry}
                className="rounded-full px-6 py-2.5 text-sm font-bold"
                style={{
                    background: "#ba1a1a",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "'Inter', sans-serif",
                }}
            >
                Try again
            </button>
        </div>
    );
}

/* ─── Page ───────────────────────────────────────── */
export default function HistoryPage() {
    const { loading: sessionLoading, session } = useAuth();
    const [showPaywall, setShowPaywall] = useState(false);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchHistory = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getHistory();
            setHistory(Array.isArray(data) ? data : []);
        } catch (err) {
            if (isLimitError(err)) {
                setShowPaywall(true);
            } else {
                setError(err?.message || "Failed to load history. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (sessionLoading || !session) return undefined;

        let active = true;
        getHistory()
            .then((data) => {
                if (active) setHistory(Array.isArray(data) ? data : []);
            })
            .catch((requestError) => {
                if (!active) return;
                if (isLimitError(requestError)) {
                    setShowPaywall(true);
                } else {
                    setError(
                        requestError?.message
                        || "Failed to load history. Please try again."
                    );
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [session, sessionLoading]);

    const isBlurred = showPaywall;

    return (
        <AppLayout>
            <div className="min-h-screen px-5 sm:px-8 lg:px-12 py-9 lg:py-11">
                <div className="mx-auto w-full max-w-6xl">
                    <header className="mb-7 md:mb-8">
                        <h1
                            className="text-4xl md:text-5xl font-black tracking-tight"
                            style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                        >
                            Your Skin Progress
                        </h1>
                        <p
                            className="mt-2 text-base"
                            style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}
                        >
                            Track how your Glow Score changes over time.
                        </p>
                    </header>

                    <section
                        className="rounded-[28px] p-6 md:p-7"
                        style={{
                            background: "#fff",
                            border: "1px solid rgba(200,196,214,0.45)",
                            filter: isBlurred ? "blur(2.5px)" : "none",
                            transition: "filter 0.2s ease",
                            pointerEvents: isBlurred ? "none" : "auto",
                        }}
                    >
                        <h2
                            className="text-2xl font-black"
                            style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                        >
                            Glow Score History
                        </h2>

                        {loading ? (
                            <HistorySkeleton />
                        ) : error ? (
                            <FetchError message={error} onRetry={fetchHistory} />
                        ) : history.length === 0 ? (
                            <EmptyHistory />
                        ) : (
                            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                                {history.map((item, index) => (
                                    <HistoryCard key={item.date} item={item} index={index} />
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>

            <PaywallModal
                open={showPaywall}
                onClose={() => setShowPaywall(false)}
                onUnlock={() => setShowPaywall(false)}
            />
        </AppLayout>
    );
}
