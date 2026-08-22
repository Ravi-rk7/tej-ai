"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getHistory } from "@/lib/api";
import { appendHistoryItems, normalizeHistoryPage } from "@/lib/historyData";
import { resultPathFor } from "@/lib/resultState";

function formatDate(isoString) {
    const date = new Date(isoString);
    return Number.isNaN(date.getTime())
        ? "Date unavailable"
        : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function HistorySkeleton() {
    return (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse" role="status" aria-live="polite">
            {[0, 1, 2].map((item) => <div key={item} className="rounded-2xl p-5 h-36" style={{ background: "rgba(200,196,214,0.25)" }} />)}
            <span className="sr-only">Loading scan history</span>
        </div>
    );
}

function EmptyHistory({ onScan }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "#f0edff" }} aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5845cb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            </div>
            <p className="text-base font-semibold" style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}>No scans yet. Complete your first scan to start tracking progress.</p>
            <button type="button" onClick={onScan} className="rounded-full px-5 py-2.5 text-sm font-bold" style={{ background: "#5845cb", color: "#fff", border: "none", cursor: "pointer" }}>Start a scan</button>
        </div>
    );
}

function FetchError({ message, onRetry }) {
    return (
        <div className="mt-5 flex flex-col items-center gap-4 rounded-2xl p-6 text-center" style={{ background: "#fff0f0", border: "1px solid rgba(186,26,26,0.2)" }} role="alert">
            <p className="text-sm font-semibold" style={{ color: "#ba1a1a", fontFamily: "'Inter', sans-serif" }}>{message}</p>
            <button type="button" onClick={onRetry} className="rounded-full px-6 py-2.5 text-sm font-bold" style={{ background: "#ba1a1a", color: "#fff", border: "none", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>Try again</button>
        </div>
    );
}

function HistoryCard({ item, index, onOpen }) {
    return (
        <button type="button" onClick={() => onOpen(item.scanId)} className="rounded-2xl p-5 text-left w-full transition-transform hover:-translate-y-0.5" style={{ background: "#fcf8ff", border: "1px solid rgba(200,196,214,0.45)", opacity: 0, animation: `fade-up 0.5s ease-out ${index * 0.06 + 0.1}s forwards`, cursor: "pointer" }} aria-label={`Open scan from ${formatDate(item.createdAt)}`}>
            <p className="text-xs uppercase tracking-[0.14em] font-semibold" style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}>{formatDate(item.createdAt)}</p>
            <p className="mt-3 text-4xl font-black" style={{ color: "#5845cb", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{item.glowScore}</p>
            <p className="mt-1 text-xs" style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}>{item.skinType || "Skin type unavailable"}</p>
            {item.concerns.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5">{item.concerns.map((concern) => <span key={`${item.scanId}-${concern}`} className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(228,223,255,0.6)", color: "#5845cb", fontFamily: "'Inter', sans-serif" }}>{concern}</span>)}</div> : <p className="mt-3 text-xs" style={{ color: "#787585" }}>No flagged concerns</p>}
            <span className="mt-4 inline-block text-xs font-bold" style={{ color: "#5845cb" }}>View result →</span>
        </button>
    );
}

export default function HistoryPage() {
    const router = useRouter();
    const [state, setState] = useState("loading");
    const [items, setItems] = useState([]);
    const [pageInfo, setPageInfo] = useState({ hasMore: false, nextCursor: null });
    const [error, setError] = useState(null);
    const [loadMoreError, setLoadMoreError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [completedAttempt, setCompletedAttempt] = useState(-1);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        let active = true;
        getHistory({ limit: 12 })
            .then((payload) => {
                if (!active) return;
                const page = normalizeHistoryPage(payload);
                if (!page) {
                    setItems([]);
                    setPageInfo({ hasMore: false, nextCursor: null });
                    setState("invalid");
                    return;
                }
                setItems(page.items);
                setPageInfo(page.pageInfo);
                setState("success");
            })
            .catch((requestError) => {
                if (!active) return;
                setError(requestError?.message || "Failed to load history. Please try again.");
                setState("error");
            })
            .finally(() => {
                if (active) setCompletedAttempt(attempt);
            });
        return () => { active = false; };
    }, [attempt]);

    const loadMore = async () => {
        if (!pageInfo.nextCursor || loadingMore) return;
        setLoadingMore(true);
        setLoadMoreError(null);
        try {
            const payload = await getHistory({ limit: 12, cursor: pageInfo.nextCursor });
            const page = normalizeHistoryPage(payload);
            if (!page) throw new Error("History response was invalid");
            setItems((current) => appendHistoryItems(current, page.items));
            setPageInfo(page.pageInfo);
        } catch (requestError) {
            setLoadMoreError(requestError?.message || "Could not load more scans.");
        } finally {
            setLoadingMore(false);
        }
    };

    const displayState = completedAttempt !== attempt ? "loading" : state;
    const retry = () => setAttempt((value) => value + 1);

    return (
        <AppLayout>
            <div className="min-h-screen px-5 sm:px-8 lg:px-12 py-9 lg:py-11">
                <div className="mx-auto w-full max-w-6xl">
                    <header className="mb-7 md:mb-8"><h1 className="text-4xl md:text-5xl font-black tracking-tight" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Your Skin Progress</h1><p className="mt-2 text-base" style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}>Track how your Glow Score changes over time.</p></header>
                    <section className="rounded-[28px] p-6 md:p-7" style={{ background: "#fff", border: "1px solid rgba(200,196,214,0.45)" }}>
                        <div className="flex items-center justify-between gap-3"><h2 className="text-2xl font-black" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Glow Score History</h2><span className="text-xs" style={{ color: "#787585" }}>Select a scan for details</span></div>
                        {displayState === "loading" && <HistorySkeleton />}
                        {displayState === "error" && <FetchError message={error} onRetry={retry} />}
                        {displayState === "invalid" && <FetchError message="History is temporarily unavailable." onRetry={retry} />}
                        {displayState === "success" && items.length === 0 && <EmptyHistory onScan={() => router.push("/scan")} />}
                        {displayState === "success" && items.length > 0 && <>
                            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">{items.map((item, index) => <HistoryCard key={item.scanId} item={item} index={index} onOpen={(scanId) => router.push(resultPathFor(scanId))} />)}</div>
                            {loadMoreError && <div className="mt-5 flex items-center justify-between gap-3 rounded-xl p-4" style={{ background: "#fff5f5" }} role="alert"><span className="text-sm" style={{ color: "#ba1a1a" }}>{loadMoreError}</span><button type="button" onClick={loadMore} className="text-sm font-bold" style={{ color: "#ba1a1a" }}>Retry</button></div>}
                            {pageInfo.hasMore && <div className="mt-7 text-center"><button type="button" onClick={loadMore} disabled={loadingMore} className="rounded-full px-6 py-3 text-sm font-bold" style={{ background: "#5845cb", color: "#fff", border: "none", cursor: loadingMore ? "wait" : "pointer", opacity: loadingMore ? 0.7 : 1 }}>{loadingMore ? "Loading…" : "Load more scans"}</button></div>}
                        </>}
                    </section>
                </div>
            </div>
        </AppLayout>
    );
}
