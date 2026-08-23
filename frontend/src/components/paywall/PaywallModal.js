"use client";

import { useEffect, useMemo, useState } from "react";
import useCheckout from "@/components/billing/useCheckout";
import { getSubscription } from "@/lib/api";
import {
    PAID_PLANS,
    canCreatePaidCheckout,
    getSubscriptionStatusLabel,
    normalizeSubscription,
} from "@/lib/billingData";

export default function PaywallModal({ open, onClose }) {
    const [selectedPlan, setSelectedPlan] = useState("starter");
    const [subscription, setSubscription] = useState(null);
    const [subscriptionState, setSubscriptionState] = useState("idle");
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [completedAttempt, setCompletedAttempt] = useState(-1);
    const {
        checkoutError,
        checkoutPlan,
        checkoutState,
        isCheckoutBusy,
        resetCheckoutError,
        startCheckout,
    } = useCheckout();

    useEffect(() => {
        if (!open) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const handleKeyDown = (event) => {
            if (event.key === "Escape" && !isCheckoutBusy) onClose();
        };
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isCheckoutBusy, onClose, open]);

    useEffect(() => {
        if (!open) return undefined;
        const controller = new AbortController();
        let active = true;

        getSubscription({ signal: controller.signal })
            .then((data) => {
                if (!active) return;
                const normalized = normalizeSubscription(data);
                setSubscription(normalized);
                setSubscriptionState(normalized ? "success" : "invalid");
                setCompletedAttempt(loadAttempt);
            })
            .catch((error) => {
                if (!active || error?.name === "AbortError") return;
                setSubscription(null);
                setSubscriptionState("error");
                setCompletedAttempt(loadAttempt);
            });

        return () => {
            active = false;
            controller.abort();
        };
    }, [loadAttempt, open]);

    const displaySubscriptionState = completedAttempt === loadAttempt
        ? subscriptionState
        : "loading";
    const currentPlan = subscription?.plan || "free";
    const availablePlans = useMemo(
        () => PAID_PLANS.filter((plan) => canCreatePaidCheckout(subscription, plan.slug)),
        [subscription]
    );
    const effectiveSelectedPlan = availablePlans.some(({ slug }) => slug === selectedPlan)
        ? selectedPlan
        : availablePlans[0]?.slug || null;

    if (!open) return null;

    const closeModal = () => {
        if (!isCheckoutBusy) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-120 flex items-center justify-center p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="paywall-title"
        >
            <button
                type="button"
                className="absolute inset-0 h-full w-full border-0"
                style={{ background: "rgba(26,25,48,0.32)", backdropFilter: "blur(8px)" }}
                onClick={closeModal}
                aria-label="Close upgrade dialog"
            />

            <div
                className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[30px] p-6 sm:p-8"
                style={{ background: "#fcf8ff", border: "1px solid rgba(200,196,214,0.55)", boxShadow: "0 30px 80px -22px rgba(26,25,48,0.35)" }}
            >
                <button
                    type="button"
                    onClick={closeModal}
                    disabled={isCheckoutBusy}
                    aria-label="Close upgrade dialog"
                    className="absolute right-5 top-5 rounded-full p-2 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ color: "#474554", background: "#efebff", border: "none" }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>

                <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "#5845cb" }}>Monthly limit reached</p>
                <h2 id="paywall-title" className="mt-2 pr-10 text-3xl font-black sm:text-4xl" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Choose a larger scan allowance
                </h2>
                <p className="mt-3 text-sm leading-6" style={{ color: "#474554" }}>
                    Your saved results and routine features stay the same. Upgrading only increases the number of scans available each month.
                </p>

                {displaySubscriptionState === "loading" && (
                    <p className="mt-6 rounded-2xl p-4 text-sm font-semibold" style={{ background: "#efebff", color: "#5845cb" }} role="status">
                        Loading your current plan…
                    </p>
                )}

                {(displaySubscriptionState === "error" || displaySubscriptionState === "invalid") && (
                    <div className="mt-6 rounded-2xl p-4" style={{ background: "#fff2f2" }} role="alert">
                        <p className="text-sm font-semibold" style={{ color: "#8f1d1d" }}>We could not verify your current plan.</p>
                        <button type="button" onClick={() => setLoadAttempt((value) => value + 1)} className="mt-3 text-sm font-bold" style={{ color: "#5845cb" }}>
                            Try again
                        </button>
                    </div>
                )}

                {displaySubscriptionState === "success" && subscription && (
                    <>
                        <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
                            <span style={{ color: "#787585" }}>Current plan:</span>
                            <strong className="capitalize" style={{ color: "#1a1930" }}>{subscription.plan}</strong>
                            <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "#e4dfff", color: "#5845cb" }}>
                                {getSubscriptionStatusLabel(subscription.status)}
                            </span>
                        </div>

                        {availablePlans.length > 0 ? (
                            <div className={`mt-6 grid grid-cols-1 gap-3 ${availablePlans.length > 1 ? "sm:grid-cols-2" : ""}`}>
                                {availablePlans.map((plan) => {
                                    const selected = effectiveSelectedPlan === plan.slug;
                                    return (
                                        <button
                                            key={plan.slug}
                                            type="button"
                                            onClick={() => {
                                                resetCheckoutError();
                                                setSelectedPlan(plan.slug);
                                            }}
                                            disabled={isCheckoutBusy}
                                            aria-pressed={selected}
                                            className="rounded-2xl p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
                                            style={{ border: selected ? "2px solid #5845cb" : "1px solid rgba(200,196,214,0.75)", background: "#fff" }}
                                        >
                                            <p className="text-sm font-bold" style={{ color: "#1a1930" }}>{plan.name}</p>
                                            <p className="mt-1 text-2xl font-black" style={{ color: "#5845cb" }}>{plan.price}<span className="text-xs font-semibold">{plan.period}</span></p>
                                            <p className="mt-2 text-xs font-semibold" style={{ color: "#787585" }}>{plan.scans} scans per month</p>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="mt-6 rounded-2xl p-4" style={{ background: "#efebff" }}>
                                <p className="text-sm font-semibold" style={{ color: "#5845cb" }}>
                                    A paid subscription is already linked to this account. Additional paid checkouts are disabled to prevent a duplicate subscription.
                                </p>
                            </div>
                        )}

                        {availablePlans.length > 0 && (
                            <button
                                type="button"
                                onClick={() => effectiveSelectedPlan && startCheckout(effectiveSelectedPlan)}
                                disabled={!effectiveSelectedPlan || isCheckoutBusy}
                                className="glow-button mt-6 w-full rounded-full px-6 py-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-65"
                                style={{ color: "#fff", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                            >
                                {isCheckoutBusy
                                    ? checkoutState === "redirecting" ? "Opening secure checkout…" : `Preparing ${checkoutPlan || ""} checkout…`
                                    : `Continue with ${effectiveSelectedPlan ? effectiveSelectedPlan[0].toUpperCase() + effectiveSelectedPlan.slice(1) : "plan"}`}
                            </button>
                        )}
                    </>
                )}

                {checkoutError && (
                    <p className="mt-4 text-center text-sm font-semibold" style={{ color: "#ba1a1a" }} role="alert">
                        {checkoutError}
                    </p>
                )}

                <p className="mt-5 text-center text-xs" style={{ color: "#787585" }}>
                    Prices are shown in USD. Checkout is hosted securely by Dodo Payments.
                </p>
            </div>
        </div>
    );
}
