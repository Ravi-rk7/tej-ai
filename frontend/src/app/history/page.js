"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import PaywallModal from "@/components/paywall/PaywallModal";

const previewHistory = [
    { date: "Apr 22, 2026", score: 78 },
    { date: "Apr 18, 2026", score: 75 },
    { date: "Apr 14, 2026", score: 72 },
];

export default function HistoryPage() {
    const [showPaywall, setShowPaywall] = useState(false);

    useEffect(() => {
        setShowPaywall(true);
    }, []);

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
                    </header>

                    <section
                        className="rounded-[28px] p-6 md:p-7"
                        style={{
                            background: "#fff",
                            border: "1px solid rgba(200,196,214,0.45)",
                            filter: showPaywall ? "blur(2.5px)" : "none",
                            transition: "filter 0.2s ease",
                        }}
                    >
                        <h2
                            className="text-2xl font-black"
                            style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                        >
                            Glow Score History
                        </h2>

                        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {previewHistory.map((item) => (
                                <article
                                    key={item.date}
                                    className="rounded-2xl p-5"
                                    style={{
                                        background: "#fcf8ff",
                                        border: "1px solid rgba(200,196,214,0.45)",
                                    }}
                                >
                                    <p
                                        className="text-xs uppercase tracking-[0.14em] font-semibold"
                                        style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}
                                    >
                                        {item.date}
                                    </p>
                                    <p
                                        className="mt-3 text-4xl font-black"
                                        style={{ color: "#5845cb", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                                    >
                                        {item.score}
                                    </p>
                                </article>
                            ))}
                        </div>
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
