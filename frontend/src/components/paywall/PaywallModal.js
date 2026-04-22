"use client";

import { useEffect } from "react";

const BENEFITS = [
    "Track Glow Score daily",
    "See real progress",
    "Smarter routines",
];

export default function PaywallModal({
    open,
    onClose,
    onUnlock,
}) {
    useEffect(() => {
        if (!open) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-120 flex items-center justify-center p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Subscription paywall"
            style={{ animation: "fade-in 0.25s ease-out forwards" }}
        >
            <div
                className="absolute inset-0"
                style={{
                    background: "rgba(26,25,48,0.28)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                }}
                onClick={onClose}
            />

            <div
                className="relative w-full max-w-140 rounded-[30px] p-6 sm:p-8"
                style={{
                    background: "#fcf8ff",
                    border: "1px solid rgba(200,196,214,0.55)",
                    boxShadow: "0 30px 80px -22px rgba(26,25,48,0.35)",
                    animation: "modal-pop 0.33s cubic-bezier(0.22, 1, 0.36, 1) forwards",
                }}
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close paywall"
                    className="absolute right-5 top-5 rounded-full p-1.5"
                    style={{
                        color: "#474554",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>

                <div className="mx-auto mb-4 mt-1 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: "#e4dfff" }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5845cb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3l2.5 5L20 9l-4 4 .9 5.5L12 16l-4.9 2.5L8 13 4 9l5.5-1z" />
                    </svg>
                </div>

                <h2
                    className="text-center text-3xl sm:text-[40px] font-black leading-tight"
                    style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                    Start Improving Your Skin Today
                </h2>

                <ul className="mt-6 rounded-2xl p-4 sm:p-5 space-y-3" style={{ background: "rgba(228,223,255,0.45)" }}>
                    {BENEFITS.map((benefit) => (
                        <li key={benefit} className="flex items-center gap-3">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center"
                                style={{ background: "#5845cb", color: "#fff" }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </span>
                            <span style={{ color: "#1a1930", fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                                {benefit}
                            </span>
                        </li>
                    ))}
                </ul>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <article
                        className="rounded-2xl p-4 sm:p-5"
                        style={{
                            border: "2px solid #5845cb",
                            background: "#fff",
                            boxShadow: "0 14px 32px -20px rgba(88,69,203,0.45)",
                        }}
                    >
                        <span
                            className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
                            style={{ background: "#e4dfff", color: "#5845cb", fontFamily: "'Inter', sans-serif" }}
                        >
                            Most Popular
                        </span>
                        <p className="mt-3 text-sm font-semibold" style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}>
                            Starter
                        </p>
                        <p className="mt-1 text-[36px] leading-none font-black" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                            $6.99
                        </p>
                    </article>

                    <article
                        className="rounded-2xl p-4 sm:p-5"
                        style={{
                            border: "1px solid rgba(200,196,214,0.75)",
                            background: "#fff",
                        }}
                    >
                        <p className="text-sm font-semibold" style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}>
                            Pro
                        </p>
                        <p className="mt-1 text-[36px] leading-none font-black" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                            $12.99
                        </p>
                    </article>
                </div>

                <button
                    type="button"
                    onClick={onUnlock}
                    className="glow-button mt-6 w-full rounded-full py-4 px-6 text-base font-bold"
                    style={{
                        color: "#fff",
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                >
                    Unlock My Skin Plan
                </button>
            </div>
        </div>
    );
}
