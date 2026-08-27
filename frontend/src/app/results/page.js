"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { deleteScan, getScanResult } from "@/lib/api";
import { normalizeScanResult } from "@/lib/scanResult";
import { classifyResultError, isValidScanId } from "@/lib/resultState";

const CONCERN_STYLES = {
    Acne: { bg: "#ffdfe0", color: "#ba1a1a" },
    Pigmentation: { bg: "#ffe8d4", color: "#8a3800" },
    "Dryness / dehydration": { bg: "#fff0d4", color: "#8a5c00" },
    Oiliness: { bg: "#d4f3e4", color: "#1a6645" },
    Wrinkles: { bg: "#e4dfff", color: "#5845cb" },
};
const DEFAULT_CONCERN_STYLE = { bg: "#f0edff", color: "#5845cb" };
const SAFETY_LABELS = {
    patchTest: "Patch testing",
    spf: "Sun protection",
    cautions: "Cautions",
    disclaimer: "Wellness scope",
    dermatologist: "When to seek advice",
};

function useCountUp(target, duration = 900) {
    const [value, setValue] = useState(0);
    useEffect(() => {
        let animationFrame;
        const start = performance.now();
        const tick = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
            if (progress < 1) animationFrame = requestAnimationFrame(tick);
        };
        animationFrame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animationFrame);
    }, [target, duration]);
    return value;
}

function ResultHeader({ deleting, onDelete, onRescan }) {
    return (
        <header className="mb-7 md:mb-9 flex items-center justify-between gap-4 flex-wrap">
            <div>
                <p className="text-xs font-bold tracking-[0.16em] uppercase" style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}>Results overview</p>
                <h1 className="mt-2 text-4xl md:text-5xl font-black tracking-tight" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Your Radiant Journey</h1>
            </div>
            <div className="flex flex-wrap gap-3">
                {onDelete && <button type="button" onClick={onDelete} disabled={deleting} className="rounded-full border px-6 py-3 text-sm font-bold disabled:opacity-50" style={{ borderColor: "#8f1d1d", color: "#8f1d1d", background: "#fff", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{deleting ? "Deleting…" : "Delete result"}</button>}
                <button type="button" onClick={onRescan} className="rounded-full px-7 py-3.5 text-sm md:text-base font-bold" style={{ background: "linear-gradient(135deg, #5845cb 0%, #a88bff 100%)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Scan Again</button>
            </div>
        </header>
    );
}

function GlowScoreCard({ glowScore }) {
    const score = useCountUp(glowScore);
    return (
        <article className="rounded-[28px] p-7 md:p-8" style={{ background: "#fff", border: "1px solid rgba(200,196,214,0.45)", boxShadow: "0 20px 50px -24px rgba(88,69,203,0.30)" }}>
            <p className="text-[12px] font-semibold tracking-[0.12em] uppercase" style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}>Analysis complete</p>
            <div className="mt-5 rounded-3xl p-6 md:p-7" style={{ background: "linear-gradient(135deg, #5845cb 0%, #a88bff 100%)" }}>
                <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.9)", fontFamily: "'Inter', sans-serif" }}>Glow Score</p>
                <div className="mt-2 flex items-end gap-2">
                    <span className="text-6xl md:text-7xl font-black leading-none" style={{ color: "#fff", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{score}</span>
                    <span className="text-sm font-semibold pb-2" style={{ color: "rgba(255,255,255,0.88)", fontFamily: "'Inter', sans-serif" }}>/100</span>
                </div>
                <p className="mt-3 text-sm font-semibold" style={{ color: "rgba(255,255,255,0.88)", fontFamily: "'Inter', sans-serif" }}>Cosmetic wellness score</p>
            </div>
            <p className="mt-5 rounded-2xl px-4 py-3 text-sm font-semibold w-fit" style={{ background: "#d8f3e9", color: "#5845cb", fontFamily: "'Inter', sans-serif" }}>Score: {score}/100</p>
        </article>
    );
}

function ConcernsCard({ concerns }) {
    return (
        <article className="rounded-[28px] p-7 md:p-8" style={{ background: "#fff", border: "1px solid rgba(200,196,214,0.45)", boxShadow: "0 18px 45px -24px rgba(26,25,48,0.16)" }}>
            <h2 className="text-2xl md:text-[30px] font-black leading-tight" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Your Skin Results</h2>
            <p className="mt-3 text-base" style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}>Cosmetic focus areas detected from this scan.</p>
            {concerns.length === 0 ? (
                <p className="mt-7 rounded-2xl px-4 py-3 text-sm" style={{ background: "#f0edff", color: "#5845cb", fontFamily: "'Inter', sans-serif" }}>No notable cosmetic concerns were detected in this scan.</p>
            ) : (
                <div className="mt-7 flex flex-wrap gap-3">
                    {concerns.map((concern, index) => {
                        const style = CONCERN_STYLES[concern.label] || DEFAULT_CONCERN_STYLE;
                        return (
                            <div key={`${concern.key}-${index}`} className="flex flex-col gap-1">
                                <span className="inline-flex items-center rounded-full px-4 py-2.5 text-sm font-semibold" style={{ background: style.bg, color: style.color, fontFamily: "'Inter', sans-serif" }}>{concern.label}</span>
                                {concern.severity && <span className="px-2 text-xs capitalize" style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}>{concern.severity}{concern.score === null ? "" : ` - score ${concern.score}`}</span>}
                            </div>
                        );
                    })}
                </div>
            )}
        </article>
    );
}

function RoutineCard({ step, index }) {
    return (
        <article className="rounded-3xl p-5 md:p-6" style={{ background: "#fff", border: "1px solid rgba(200,196,214,0.45)", boxShadow: "0 16px 40px -28px rgba(26,25,48,0.28)" }}>
            <span className="text-xs font-bold tracking-[0.16em] uppercase" style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}>Step {String(index + 1).padStart(2, "0")}</span>
            <h3 className="mt-4 text-2xl font-black" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{step.name}</h3>
            <p className="mt-2 text-[15px] leading-7" style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}>{step.instructions || "Follow the product label and stop if irritation occurs."}</p>
        </article>
    );
}

function WarningsCard({ warnings }) {
    if (!warnings.length) return null;
    return (
        <section className="mt-6 rounded-2xl p-5" style={{ background: "#fff8e7", border: "1px solid #f4d99a" }} aria-label="Image quality notices">
            <h2 className="text-lg font-black" style={{ color: "#6b4c00", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Photo quality notes</h2>
            <ul className="mt-3 grid gap-2 text-sm leading-6" style={{ color: "#6b4c00", fontFamily: "'Inter', sans-serif" }}>
                {warnings.map((warning) => <li key={warning.code}>{warning.message}</li>)}
            </ul>
        </section>
    );
}

function RoutineSection({ routine }) {
    if (!routine) {
        return <section className="mt-8 rounded-3xl p-6" style={{ background: "#f7f4ff", border: "1px solid rgba(200,196,214,0.45)" }}><h2 className="text-xl font-black" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Routine unavailable</h2><p className="mt-2 text-sm" style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}>This older result does not contain a routine. Start a new scan to receive a safe cosmetic wellness routine.</p></section>;
    }

    return (
        <section className="mt-8 md:mt-10">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>AI Routine</h2>
            <p className="mt-2 text-base" style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}>A personalized cosmetic wellness routine based on your scan.</p>
            {routine.source === "fallback" && <p className="mt-4 rounded-2xl px-4 py-3 text-sm" style={{ background: "#f0edff", color: "#5845cb", fontFamily: "'Inter', sans-serif" }}>A standard safe routine is shown because personalized generation was unavailable.</p>}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {[["Morning", routine.morning], ["Night", routine.night]].map(([period, steps]) => (
                    <div key={period}>
                        <h3 className="mb-3 text-xl font-black" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{period}</h3>
                        {steps.length ? <div className="grid gap-4">{steps.map((step, index) => <RoutineCard key={`${period}-${step.name}-${index}`} step={step} index={index} />)}</div> : <p className="rounded-2xl p-4 text-sm" style={{ background: "#fff", color: "#787585" }}>No steps recorded for this period.</p>}
                    </div>
                ))}
            </div>
            <div className="mt-6 rounded-2xl p-5" style={{ background: "#f7f4ff", border: "1px solid rgba(200,196,214,0.45)" }}>
                <h3 className="text-lg font-black" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Safety notes</h3>
                <ul className="mt-3 grid gap-3 text-sm leading-6" style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}>
                    {Object.entries(routine.safety).filter(([, text]) => text).map(([key, text]) => <li key={key}><span className="font-semibold">{SAFETY_LABELS[key] || key}:</span> {text}</li>)}
                </ul>
            </div>
        </section>
    );
}

function StatusCard({ title, message, actionLabel, onAction, role = "status" }) {
    return (
        <div className="flex flex-col items-center justify-center gap-5 py-24 text-center" role={role} aria-live="polite">
            <h2 className="text-2xl font-black" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{title}</h2>
            <p className="max-w-xl text-base" style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}>{message}</p>
            {actionLabel && <button type="button" onClick={onAction} className="rounded-full px-7 py-3.5 text-sm font-bold" style={{ background: "linear-gradient(135deg, #5845cb 0%, #a88bff 100%)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{actionLabel}</button>}
        </div>
    );
}

function LoadingCard() {
    return <StatusCard title="Loading your result" message="Securely retrieving your saved cosmetic wellness analysis..." />;
}

function ResultsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const scanId = searchParams.get("id")?.trim() || "";
    const [state, setState] = useState("idle");
    const [rawResult, setRawResult] = useState(null);
    const [loadedScanId, setLoadedScanId] = useState(null);
    const [completedRetryToken, setCompletedRetryToken] = useState(-1);
    const [retryToken, setRetryToken] = useState(0);
    const [deleteState, setDeleteState] = useState("idle");
    const [deleteError, setDeleteError] = useState("");

    useEffect(() => {
        if (!scanId || !isValidScanId(scanId)) return undefined;

        const controller = new AbortController();
        getScanResult(scanId, { signal: controller.signal })
            .then((data) => {
                const normalized = normalizeScanResult(data);
                setRawResult(data);
                setLoadedScanId(scanId);
                setCompletedRetryToken(retryToken);
                setState(normalized?.valid ? "success" : "invalid");
            })
            .catch((error) => {
                if (error?.name === "AbortError") return;
                setRawResult(null);
                setLoadedScanId(scanId);
                setCompletedRetryToken(retryToken);
                setState(classifyResultError(error));
            });

        return () => controller.abort();
    }, [retryToken, scanId]);

    const displayState = !scanId
        ? "empty"
        : !isValidScanId(scanId)
            ? "invalid"
            : loadedScanId !== scanId || completedRetryToken !== retryToken
                ? "loading"
                : state;
    const normalized = useMemo(
        () => displayState === "success" ? normalizeScanResult(rawResult) : null,
        [displayState, rawResult]
    );
    const goToScan = useCallback(() => router.push("/scan"), [router]);
    const removeResult = useCallback(async () => {
        if (deleteState === "deleting" || !window.confirm("Delete this saved result? This cannot be undone and does not restore scan allowance.")) return;
        setDeleteState("deleting");
        setDeleteError("");
        try {
            const result = await deleteScan(scanId);
            if (result?.deleted !== true) throw new Error("Scan deletion was not confirmed");
            router.replace("/history");
        } catch (requestError) {
            setDeleteState("error");
            setDeleteError(requestError?.message || "This result could not be deleted.");
        }
    }, [deleteState, router, scanId]);

    return (
        <div className="min-h-screen px-5 sm:px-8 lg:px-12 py-9 lg:py-11">
            <div className="mx-auto w-full max-w-6xl">
                <ResultHeader onRescan={goToScan} onDelete={displayState === "success" ? removeResult : null} deleting={deleteState === "deleting"} />
                {deleteError && <div className="mb-5 rounded-2xl p-4 text-sm font-semibold" style={{ background: "#fff2f2", color: "#8f1d1d" }} role="alert">{deleteError}</div>}
                {displayState === "loading" && <LoadingCard />}
                {displayState === "empty" && <StatusCard title="No result selected" message="Choose a saved scan result or start a new scan to see your cosmetic wellness analysis." actionLabel="Start a Scan" onAction={goToScan} />}
                {displayState === "invalid" && <StatusCard title="Results unavailable" message="We could not read a valid saved scan result. Please start a new scan." actionLabel="Start a Scan" onAction={goToScan} role="alert" />}
                {displayState === "not_found" && <StatusCard title="Results unavailable" message="This scan result is unavailable for the current account." actionLabel="Start a Scan" onAction={goToScan} role="alert" />}
                {displayState === "unauthorized" && <StatusCard title="Session required" message="Please sign in again to view this saved result." actionLabel="Sign in" onAction={() => router.push(`/login?next=${encodeURIComponent(`/results?id=${scanId}`)}`)} role="alert" />}
                {displayState === "retryable" && <StatusCard title="We could not load this result" message="The saved result could not be retrieved. Check your connection and try again." actionLabel="Retry" onAction={() => setRetryToken((value) => value + 1)} role="alert" />}
                {displayState === "success" && normalized?.valid && (
                    <>
                        <section className="grid grid-cols-1 xl:grid-cols-5 gap-6 lg:gap-7">
                            <div className="xl:col-span-2"><GlowScoreCard glowScore={normalized.glowScore} /></div>
                            <div className="xl:col-span-3"><ConcernsCard concerns={normalized.concerns} /></div>
                        </section>
                        <p className="mt-5 text-sm" style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}>Skin type: <span className="font-semibold" style={{ color: "#474554" }}>{normalized.skinType}</span></p>
                        <WarningsCard warnings={normalized.warnings} />
                        <RoutineSection routine={normalized.routine} />
                    </>
                )}
            </div>
        </div>
    );
}

export default function ResultsPage() {
    return (
        <AppLayout>
            <Suspense fallback={<div className="min-h-screen px-5 sm:px-8 lg:px-12 py-9 lg:py-11"><LoadingCard /></div>}>
                <ResultsContent />
            </Suspense>
        </AppLayout>
    );
}
