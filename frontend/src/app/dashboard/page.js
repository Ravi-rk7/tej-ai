"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getDashboard } from "@/lib/api";
import { normalizeDashboard } from "@/lib/dashboardData";
import { resultPathFor } from "@/lib/resultState";

const cardStyle = {
    background: "#fff",
    border: "1px solid rgba(200,196,214,0.45)",
    boxShadow: "0 16px 40px -25px rgba(26,25,48,0.15)",
};

const formatDate = (value) => {
    if (!value) return "Not available";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

function LoadingState() {
    return <div className="grid gap-5 animate-pulse" role="status" aria-live="polite"><div className="h-36 rounded-[28px]" style={{ background: "rgba(200,196,214,0.25)" }} /><div className="grid grid-cols-1 md:grid-cols-3 gap-5"><div className="h-32 rounded-3xl" style={{ background: "rgba(200,196,214,0.25)" }} /><div className="h-32 rounded-3xl" style={{ background: "rgba(200,196,214,0.25)" }} /><div className="h-32 rounded-3xl" style={{ background: "rgba(200,196,214,0.25)" }} /></div><span className="sr-only">Loading dashboard</span></div>;
}

function ErrorState({ onRetry }) {
    return <div className="rounded-3xl p-8 text-center" style={{ ...cardStyle, background: "#fff5f5" }} role="alert"><h2 className="text-xl font-black" style={{ color: "#ba1a1a", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Dashboard unavailable</h2><p className="mt-2 text-sm" style={{ color: "#7f1d1d", fontFamily: "'Inter', sans-serif" }}>We could not load your saved dashboard data.</p><button type="button" onClick={onRetry} className="mt-5 rounded-full px-6 py-3 text-sm font-bold" style={{ background: "#ba1a1a", color: "#fff", border: "none", cursor: "pointer" }}>Try again</button></div>;
}

function TrendChart({ points }) {
    if (points.length < 2) {
        return <div className="rounded-2xl px-4 py-5 text-sm" style={{ background: "#f7f4ff", color: "#5845cb", fontFamily: "'Inter', sans-serif" }}>Complete one more scan to see a real score trend.</div>;
    }
    const width = 640;
    const height = 190;
    const min = Math.min(...points.map((point) => point.glowScore));
    const max = Math.max(...points.map((point) => point.glowScore));
    const spread = Math.max(10, max - min);
    const coordinates = points.map((point, index) => ({
        ...point,
        x: points.length === 1 ? width / 2 : (index / (points.length - 1)) * width,
        y: height - ((point.glowScore - (min - spread * 0.1)) / (spread * 1.2)) * height,
    }));
    return <div className="overflow-x-auto" aria-label="Glow Score trend chart"><svg viewBox={`0 0 ${width} ${height + 34}`} role="img" aria-labelledby="trend-title" className="min-w-[520px] w-full"><title id="trend-title">Glow Score trend over saved scans</title><polyline fill="none" stroke="#5845cb" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" points={coordinates.map((point) => `${point.x},${point.y}`).join(" ")} />{coordinates.map((point) => <circle key={point.scanId} cx={point.x} cy={point.y} r="7" fill="#fff" stroke="#5845cb" strokeWidth="4"><title>{`${point.glowScore} on ${formatDate(point.createdAt)}`}</title></circle>)}<text x="0" y={height + 25} fill="#787585" fontSize="12">{formatDate(points[0].createdAt)}</text><text x={width} y={height + 25} textAnchor="end" fill="#787585" fontSize="12">{formatDate(points.at(-1).createdAt)}</text></svg></div>;
}

function DashboardContent({ data, onScan, onLatest }) {
    const trendLabel = data.trend.direction === "insufficient_data" ? "Not enough data" : `${data.trend.direction} (${data.trend.delta > 0 ? "+" : ""}${data.trend.delta})`;
    const usagePercent = Math.min(100, Math.round((data.usage.used / data.usage.limit) * 100));
    return <>
        <section className="grid grid-cols-1 xl:grid-cols-5 gap-5 md:gap-6">
            <article className="xl:col-span-2 rounded-[28px] p-7" style={{ ...cardStyle, background: "linear-gradient(135deg, #5845cb 0%, #a88bff 100%)", color: "#fff" }}><p className="text-xs font-bold uppercase tracking-[0.16em] opacity-80">Latest Glow Score</p>{data.latestScan ? <><p className="mt-5 text-7xl font-black leading-none" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{data.latestScan.glowScore}</p><p className="mt-3 text-sm opacity-85">{data.latestScan.skinType || "Skin type unavailable"}</p><button type="button" onClick={onLatest} className="mt-6 rounded-full px-5 py-2.5 text-sm font-bold" style={{ background: "#fff", color: "#5845cb", border: "none", cursor: "pointer" }}>View latest result</button></> : <><p className="mt-5 text-2xl font-black" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>No scans yet</p><p className="mt-2 text-sm opacity-85">Start a scan to create your first saved result.</p><button type="button" onClick={onScan} className="mt-6 rounded-full px-5 py-2.5 text-sm font-bold" style={{ background: "#fff", color: "#5845cb", border: "none", cursor: "pointer" }}>Start a scan</button></>}</article>
            <article className="xl:col-span-3 rounded-[28px] p-7" style={cardStyle}><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "#787585" }}>Score trend</p><h2 className="mt-2 text-2xl font-black" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{trendLabel}</h2></div><span className="rounded-full px-3 py-1.5 text-xs font-bold capitalize" style={{ background: "#e4dfff", color: "#5845cb" }}>{data.subscription.plan}</span></div><div className="mt-6"><TrendChart points={data.trend.points} /></div></article>
        </section>
        <section className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-5">
            <article className="rounded-3xl p-6" style={cardStyle}><p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: "#787585" }}>Plan</p><p className="mt-3 text-3xl font-black capitalize" style={{ color: "#5845cb", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{data.subscription.plan}</p><p className="mt-2 text-sm capitalize" style={{ color: "#474554" }}>Status: {data.subscription.status}</p></article>
            <article className="rounded-3xl p-6" style={cardStyle}><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: "#787585" }}>Monthly usage</p><span className="text-sm font-bold" style={{ color: "#5845cb" }}>{data.usage.used}/{data.usage.limit}</span></div><div className="mt-5 h-3 overflow-hidden rounded-full" style={{ background: "#e4dfff" }}><div className="h-full rounded-full" style={{ width: `${usagePercent}%`, background: "linear-gradient(90deg, #5845cb, #a88bff)" }} /></div><p className="mt-3 text-sm" style={{ color: "#474554" }}>{data.usage.remaining} scan{data.usage.remaining === 1 ? "" : "s"} remaining</p></article>
            <article className="rounded-3xl p-6" style={cardStyle}><p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: "#787585" }}>Next reset</p><p className="mt-3 text-xl font-black" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{formatDate(data.usage.resetAt)}</p><p className="mt-2 text-sm" style={{ color: "#474554" }}>Usage follows the UTC calendar month.</p></article>
        </section>
    </>;
}

export default function DashboardPage() {
    const router = useRouter();
    const [state, setState] = useState("idle");
    const [rawData, setRawData] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [completedAttempt, setCompletedAttempt] = useState(-1);

    useEffect(() => {
        let active = true;
        getDashboard()
            .then((data) => {
                if (!active) return;
                const normalized = normalizeDashboard(data);
                setRawData(data);
                setCompletedAttempt(attempt);
                setState(normalized ? "success" : "invalid");
            })
            .catch(() => {
                if (!active) return;
                setRawData(null);
                setCompletedAttempt(attempt);
                setState("error");
            });
        return () => { active = false; };
    }, [attempt]);

    const displayState = completedAttempt !== attempt ? "loading" : state;
    const data = useMemo(() => displayState === "success" ? normalizeDashboard(rawData) : null, [displayState, rawData]);
    const goScan = () => router.push("/scan");
    const goLatest = () => data?.latestScan?.scanId && router.push(resultPathFor(data.latestScan.scanId));

    return <AppLayout><div className="min-h-screen px-5 sm:px-8 lg:px-12 py-9 lg:py-11"><div className="mx-auto w-full max-w-6xl"><header className="mb-7 md:mb-9"><h1 className="text-4xl md:text-5xl font-black tracking-tight" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Your Skin Progress</h1><p className="mt-2 text-base" style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}>A private view of your saved scan data.</p></header>{displayState === "loading" && <LoadingState />}{displayState === "error" && <ErrorState onRetry={() => setAttempt((value) => value + 1)} />}{displayState === "invalid" && <ErrorState onRetry={() => setAttempt((value) => value + 1)} />}{displayState === "success" && data && <DashboardContent data={data} onScan={goScan} onLatest={goLatest} />}</div></div></AppLayout>;
}
