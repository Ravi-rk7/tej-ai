"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";

/* ─── Accent palette for concerns ───────────────── */
const CONCERN_STYLES = {
    Acne:           { bg: "#ffdfe0", color: "#ba1a1a" },
    "Uneven Tone":  { bg: "#e8ddff", color: "#5845cb" },
    Dryness:        { bg: "#fff0d4", color: "#8a5c00" },
    Oiliness:       { bg: "#d4f3e4", color: "#1a6645" },
    Hyperpigmentation: { bg: "#ffe8d4", color: "#8a3800" },
    Wrinkles:       { bg: "#e4dfff", color: "#5845cb" },
};
const DEFAULT_CONCERN_STYLE = { bg: "#f0edff", color: "#5845cb" };

/* ─── Count-up animation ─────────────────────────── */
function useCountUp(target, duration = 1400) {
    const [value, setValue] = useState(0);
    useEffect(() => {
        let animationFrame;
        const start = performance.now();
        const tick = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(target * eased));
            if (progress < 1) animationFrame = requestAnimationFrame(tick);
        };
        animationFrame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animationFrame);
    }, [target, duration]);
    return value;
}

/* ─── Glow Score Card ────────────────────────────── */
function GlowScoreCard({ glowScore }) {
    const score = useCountUp(glowScore ?? 0);
    const scoreColor = useMemo(() => {
        if (score >= 80) return "#5845cb";
        if (score >= 60) return "#674ab9";
        return "#a01e96";
    }, [score]);

    return (
        <article
            className="rounded-[28px] p-7 md:p-8"
            style={{
                background: "#fff",
                border: "1px solid rgba(200,196,214,0.45)",
                boxShadow: "0 20px 50px -24px rgba(88,69,203,0.30)",
            }}
        >
            <p
                className="text-[12px] font-semibold tracking-[0.12em] uppercase"
                style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}
            >
                Analysis Complete
            </p>

            <div
                className="mt-5 rounded-3xl p-6 md:p-7"
                style={{
                    background: "linear-gradient(135deg, #5845cb 0%, #a88bff 100%)",
                    animation: "glow-pulse 2.8s ease-in-out infinite",
                }}
            >
                <p
                    className="text-sm font-semibold"
                    style={{ color: "rgba(255,255,255,0.9)", fontFamily: "'Inter', sans-serif" }}
                >
                    Glow Score
                </p>
                <div className="mt-2 flex items-end gap-2">
                    <span
                        className="text-6xl md:text-7xl font-black leading-none"
                        style={{ color: "#fff", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                    >
                        {score}
                    </span>
                    <span
                        className="text-sm font-semibold pb-2"
                        style={{ color: "rgba(255,255,255,0.88)", fontFamily: "'Inter', sans-serif" }}
                    >
                        /100
                    </span>
                </div>
                <p
                    className="mt-3 text-sm font-bold"
                    style={{ color: "#fff", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                    ↑ improving
                </p>
            </div>

            <p
                className="mt-5 rounded-2xl px-4 py-3 text-sm font-semibold w-fit"
                style={{
                    background: "#d8f3e9",
                    color: scoreColor,
                    fontFamily: "'Inter', sans-serif",
                }}
            >
                Score: {score}/100
            </p>
        </article>
    );
}

/* ─── Concerns Card ──────────────────────────────── */
function ConcernsCard({ concerns }) {
    return (
        <article
            className="rounded-[28px] p-7 md:p-8"
            style={{
                background: "#fff",
                border: "1px solid rgba(200,196,214,0.45)",
                boxShadow: "0 18px 45px -24px rgba(26,25,48,0.16)",
            }}
        >
            <h2
                className="text-2xl md:text-[30px] font-black leading-tight"
                style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
                Your Skin Results
            </h2>
            <p
                className="mt-3 text-base"
                style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
            >
                Focus areas detected from your latest scan.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
                {concerns.map((concern, index) => {
                    const style = CONCERN_STYLES[concern] ?? DEFAULT_CONCERN_STYLE;
                    return (
                        <span
                            key={concern}
                            className="inline-flex items-center rounded-full px-4 py-2.5 text-sm font-semibold"
                            style={{
                                background: style.bg,
                                color: style.color,
                                fontFamily: "'Inter', sans-serif",
                                opacity: 0,
                                animation: `fade-in 0.55s ease-out ${index * 0.18 + 0.25}s forwards`,
                            }}
                        >
                            {concern}
                        </span>
                    );
                })}
            </div>
        </article>
    );
}

/* ─── Routine Card ───────────────────────────────── */
const ROUTINE_ACCENTS = ["#e4dfff", "#ffd7f3", "#e8ddff"];

function RoutineCard({ step, title, description, timing, index }) {
    return (
        <article
            className="rounded-3xl p-5 md:p-6"
            style={{
                background: "#fff",
                border: "1px solid rgba(200,196,214,0.45)",
                boxShadow: "0 16px 40px -28px rgba(26,25,48,0.28)",
                opacity: 0,
                animation: `fade-up 0.65s ease-out ${index * 0.16 + 0.2}s forwards`,
            }}
        >
            <div className="flex items-center justify-between gap-4">
                <span
                    className="text-xs font-bold tracking-[0.16em] uppercase"
                    style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}
                >
                    Step {String(index + 1).padStart(2, "0")}
                </span>
                {timing && (
                    <span
                        className="rounded-full px-3 py-1.5 text-xs font-semibold"
                        style={{
                            background: ROUTINE_ACCENTS[index % ROUTINE_ACCENTS.length],
                            color: "#5845cb",
                            fontFamily: "'Inter', sans-serif",
                        }}
                    >
                        {timing}
                    </span>
                )}
            </div>

            <h3
                className="mt-4 text-2xl font-black"
                style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
                {title}
            </h3>
            <p
                className="mt-2 text-[15px] leading-7"
                style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
            >
                {description}
            </p>
        </article>
    );
}

/* ─── Error state ────────────────────────────────── */
function NoResults({ onRescan }) {
    return (
        <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
            <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "#f0edff" }}
            >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5845cb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
            </div>
            <div>
                <h2
                    className="text-2xl font-black"
                    style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                    No Results Yet
                </h2>
                <p className="mt-2 text-base" style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}>
                    Upload a photo to get your personalized skin analysis.
                </p>
            </div>
            <button
                onClick={onRescan}
                className="rounded-full px-7 py-3.5 text-sm font-bold"
                style={{
                    background: "linear-gradient(135deg, #5845cb 0%, #a88bff 100%)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    boxShadow: "0 12px 32px -10px rgba(88,69,203,0.45)",
                }}
            >
                Start a Scan →
            </button>
        </div>
    );
}

/* ─── Page ───────────────────────────────────────── */
export default function ResultsPage() {
    const router = useRouter();
    const [results] = useState(() => {
        if (typeof window === "undefined") {
            return null;
        }

        try {
            const raw = sessionStorage.getItem("tejai_scan_result");
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    });
const routine = results?.routine ?? [];
    const concerns = results?.concerns ?? [];
    const glowScore = results?.glowScore ?? 0;

    return (
        <AppLayout>
            <div className="min-h-screen px-5 sm:px-8 lg:px-12 py-9 lg:py-11">
                <div className="mx-auto w-full max-w-6xl">
                    <header className="mb-7 md:mb-9 flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <p
                                className="text-xs font-bold tracking-[0.16em] uppercase"
                                style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}
                            >
                                Results Overview
                            </p>
                            <h1
                                className="mt-2 text-4xl md:text-5xl font-black tracking-tight"
                                style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                            >
                                Your Radiant Journey
                            </h1>
                        </div>

                        <button
                            type="button"
                            className="rounded-full px-7 py-3.5 text-sm md:text-base font-bold"
                            onClick={() => router.push("/scan")}
                            style={{
                                background: "linear-gradient(135deg, #5845cb 0%, #a88bff 100%)",
                                color: "#fff",
                                border: "none",
                                cursor: "pointer",
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                boxShadow: "0 16px 35px -14px rgba(88,69,203,0.55)",
                                transition: "transform 0.2s ease, filter 0.2s ease",
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.filter = "brightness(1.08)";
                                e.currentTarget.style.transform = "translateY(-1px)";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.filter = "brightness(1)";
                                e.currentTarget.style.transform = "translateY(0)";
                            }}
                        >
                            Scan Again
                        </button>
                    </header>

                    {!results ? (
                        <NoResults onRescan={() => router.push("/scan")} />
                    ) : (
                        <>
                            <section className="grid grid-cols-1 xl:grid-cols-5 gap-6 lg:gap-7">
                                <div className="xl:col-span-2">
                                    <GlowScoreCard glowScore={glowScore} />
                                </div>
                                <div className="xl:col-span-3">
                                    <ConcernsCard concerns={concerns} />
                                </div>
                            </section>

                            {routine.length > 0 && (
                                <section className="mt-8 md:mt-10">
                                    <div className="mb-5">
                                        <h2
                                            className="text-3xl md:text-4xl font-black tracking-tight"
                                            style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                                        >
                                            AI Routine
                                        </h2>
                                        <p
                                            className="mt-2 text-base"
                                            style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
                                        >
                                            A personalized routine based on your skin scan.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
                                        {routine.map((item, index) => (
                                            <RoutineCard
                                                key={item.title ?? index}
                                                title={item.title}
                                                description={item.description}
                                                timing={item.timing ?? item.chip}
                                                index={index}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}
                        </>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}


