"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";

const TARGET_GLOW_SCORE = 78;

const concerns = ["Acne", "Uneven Tone"];

const routineSteps = [
    {
        step: "01",
        title: "Cleanser",
        description:
            "Use a gentle, non-stripping cleanser to remove oil and impurities without drying the skin barrier.",
        chip: "AM + PM",
        accent: "#e4dfff",
    },
    {
        step: "02",
        title: "Treatment",
        description:
            "Apply a lightweight treatment serum focused on active concerns like acne and uneven tone.",
        chip: "PM Focus",
        accent: "#ffd7f3",
    },
    {
        step: "03",
        title: "Moisturizer",
        description:
            "Seal hydration with a barrier-supporting moisturizer to maintain comfort and glow overnight.",
        chip: "Barrier Support",
        accent: "#e8ddff",
    },
];

function useCountUp(target, duration = 1400) {
    const [value, setValue] = useState(0);

    useEffect(() => {
        let animationFrame;
        const start = performance.now();

        const tick = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(target * eased));

            if (progress < 1) {
                animationFrame = requestAnimationFrame(tick);
            }
        };

        animationFrame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animationFrame);
    }, [target, duration]);

    return value;
}

function GlowScoreCard() {
    const score = useCountUp(TARGET_GLOW_SCORE);
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
                Your score improved +6 this week
            </p>
        </article>
    );
}

function ConcernsCard() {
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
                {concerns.map((concern, index) => (
                    <span
                        key={concern}
                        className="inline-flex items-center rounded-full px-4 py-2.5 text-sm font-semibold"
                        style={{
                            background: concern === "Acne" ? "#ffdfe0" : "#e8ddff",
                            color: concern === "Acne" ? "#ba1a1a" : "#5845cb",
                            fontFamily: "'Inter', sans-serif",
                            opacity: 0,
                            animation: `fade-in 0.55s ease-out ${index * 0.18 + 0.25}s forwards`,
                        }}
                    >
                        {concern}
                    </span>
                ))}
            </div>
        </article>
    );
}

function RoutineCard({ step, title, description, chip, accent, index }) {
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
                    Step {step}
                </span>
                <span
                    className="rounded-full px-3 py-1.5 text-xs font-semibold"
                    style={{
                        background: accent,
                        color: "#5845cb",
                        fontFamily: "'Inter', sans-serif",
                    }}
                >
                    {chip}
                </span>
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

export default function ResultsPage() {
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
                            style={{
                                background: "linear-gradient(135deg, #5845cb 0%, #a88bff 100%)",
                                color: "#fff",
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                boxShadow: "0 16px 35px -14px rgba(88,69,203,0.55)",
                                transition: "transform 0.2s ease, filter 0.2s ease",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.filter = "brightness(1.08)";
                                e.currentTarget.style.transform = "translateY(-1px)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.filter = "brightness(1)";
                                e.currentTarget.style.transform = "translateY(0)";
                            }}
                        >
                            Save &amp; Track Progress
                        </button>
                    </header>

                    <section className="grid grid-cols-1 xl:grid-cols-5 gap-6 lg:gap-7">
                        <div className="xl:col-span-2">
                            <GlowScoreCard />
                        </div>
                        <div className="xl:col-span-3">
                            <ConcernsCard />
                        </div>
                    </section>

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
                                A clean 3-step routine personalized for your current scan.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
                            {routineSteps.map((item, index) => (
                                <RoutineCard key={item.step} {...item} index={index} />
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </AppLayout>
    );
}
