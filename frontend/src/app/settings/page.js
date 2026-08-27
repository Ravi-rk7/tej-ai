"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";
import useCheckout from "@/components/billing/useCheckout";
import { createCustomerPortalSession, getSubscription } from "@/lib/api";
import {
    BILLING_PLANS,
    BILLING_PLAN_BY_SLUG,
    PAID_PLANS,
    RETURN_STATUS_POLL_MAX_ATTEMPTS,
    canCreatePaidCheckout,
    clearCheckoutAttempt,
    getCheckoutMarker,
    getPlanFromSearch,
    getSafeBillingPortalError,
    getSubscriptionStatusLabel,
    normalizePortalSession,
    normalizeSubscription,
    readCheckoutAttempt,
    shouldPollSubscriptionReturn,
} from "@/lib/billingData";

const cardStyle = { borderColor: "rgba(200,196,214,0.45)" };
const RETURN_POLL_INTERVAL_MS = 2000;

const formatDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

function SettingsLoading() {
    return (
        <AppLayout>
            <div className="min-h-screen px-5 py-9 sm:px-8 lg:px-12 lg:py-11" role="status" aria-live="polite">
                <div className="mx-auto grid w-full max-w-5xl animate-pulse gap-5">
                    <div className="h-24 rounded-3xl bg-[#e8e3f3]" />
                    <div className="h-48 rounded-[28px] bg-[#e8e3f3]" />
                    <div className="h-80 rounded-[28px] bg-[#e8e3f3]" />
                    <span className="sr-only">Loading settings</span>
                </div>
            </div>
        </AppLayout>
    );
}

function CheckoutReturnNotice({ marker, state, subscription, targetPlan, onRefresh }) {
    if (!marker) return null;

    if (marker === "cancelled") {
        return (
            <div className="mb-5 rounded-2xl border p-4" style={{ borderColor: "#d5c9a5", background: "#fff9e8" }} role="status">
                <p className="font-bold" style={{ color: "#6f5100" }}>Checkout cancelled</p>
                <p className="mt-1 text-sm" style={{ color: "#6f5100" }}>No plan change was made. Your server-reported subscription is shown below.</p>
            </div>
        );
    }

    if (state === "loading" || state === "verifying") {
        return (
            <div className="mb-5 rounded-2xl border p-4" style={{ borderColor: "#cfc7ff", background: "#f3f0ff" }} role="status" aria-live="polite">
                <p className="font-bold" style={{ color: "#5845cb" }}>Verifying your subscription</p>
                <p className="mt-1 text-sm" style={{ color: "#474554" }}>Returning from checkout does not activate a plan by itself. We are checking the server for the confirmed status.</p>
            </div>
        );
    }

    const targetIsActive = Boolean(
        targetPlan
        && subscription?.plan === targetPlan
        && subscription?.status === "active"
    );
    const checkoutFailed = subscription?.checkout
        && ["failed", "cancelled", "expired"].includes(subscription.checkout.status);

    if (targetIsActive) {
        return (
            <div className="mb-5 rounded-2xl border p-4" style={{ borderColor: "#b9dfcb", background: "#effaf4" }} role="status">
                <p className="font-bold capitalize" style={{ color: "#1a6645" }}>{targetPlan} is active</p>
                <p className="mt-1 text-sm" style={{ color: "#315846" }}>The plan was confirmed by TejAi&apos;s subscription service.</p>
            </div>
        );
    }

    return (
        <div className="mb-5 rounded-2xl border p-4" style={{ borderColor: checkoutFailed ? "#efc2c2" : "#d5c9a5", background: checkoutFailed ? "#fff2f2" : "#fff9e8" }} role="status">
            <p className="font-bold" style={{ color: checkoutFailed ? "#8f1d1d" : "#6f5100" }}>
                {checkoutFailed ? "Checkout was not completed" : "Plan activation is not confirmed yet"}
            </p>
            <p className="mt-1 text-sm" style={{ color: checkoutFailed ? "#8f1d1d" : "#6f5100" }}>
                {checkoutFailed
                    ? "Your existing plan remains unchanged."
                    : "Do not pay again. Payment confirmation can take a moment; refresh the server status instead."}
            </p>
            {!checkoutFailed && (
                <button type="button" onClick={onRefresh} className="mt-3 rounded-full px-4 py-2 text-sm font-bold" style={{ background: "#6f5100", color: "#fff" }}>
                    Refresh status
                </button>
            )}
        </div>
    );
}

function BillingSection({ marker, requestedPlan }) {
    const router = useRouter();
    const [selectedPlan, setSelectedPlan] = useState(requestedPlan || "starter");
    const [subscription, setSubscription] = useState(null);
    const [statusState, setStatusState] = useState("idle");
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [completedAttempt, setCompletedAttempt] = useState(-1);
    const [portalState, setPortalState] = useState("idle");
    const [portalError, setPortalError] = useState("");
    const [targetPlan] = useState(() => readCheckoutAttempt()?.plan || requestedPlan || null);
    const {
        checkoutError,
        checkoutPlan,
        checkoutState,
        isCheckoutBusy,
        resetCheckoutError,
        startCheckout,
    } = useCheckout();

    useEffect(() => {
        if (marker || requestedPlan) {
            router.replace("/settings", { scroll: false });
        }
    }, [marker, requestedPlan, router]);

    useEffect(() => {
        if (marker === "cancelled") clearCheckoutAttempt();
    }, [marker]);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        let timer;

        const load = async (pollIndex = 0) => {
            try {
                const data = await getSubscription({ signal: controller.signal });
                if (!active) return;
                const normalized = normalizeSubscription(data);
                if (!normalized) {
                    setSubscription(null);
                    setStatusState("invalid");
                    setCompletedAttempt(loadAttempt);
                    return;
                }

                setSubscription(normalized);
                setCompletedAttempt(loadAttempt);

                if (
                    marker === "returned"
                    && shouldPollSubscriptionReturn({
                        subscription: normalized,
                        targetPlan,
                        attempt: pollIndex,
                        maxAttempts: RETURN_STATUS_POLL_MAX_ATTEMPTS,
                    })
                ) {
                    setStatusState("verifying");
                    timer = window.setTimeout(() => load(pollIndex + 1), RETURN_POLL_INTERVAL_MS);
                    return;
                }

                if (targetPlan && normalized.plan === targetPlan && normalized.status === "active") {
                    clearCheckoutAttempt();
                }
                setStatusState("success");
            } catch (error) {
                if (!active || error?.name === "AbortError") return;
                setSubscription(null);
                setStatusState("error");
                setCompletedAttempt(loadAttempt);
            }
        };

        load();
        return () => {
            active = false;
            controller.abort();
            if (timer) window.clearTimeout(timer);
        };
    }, [loadAttempt, marker, targetPlan]);

    const displayState = completedAttempt === loadAttempt ? statusState : "loading";
    const currentPlan = subscription?.plan || "free";
    const checkoutPlans = useMemo(
        () => PAID_PLANS.filter((plan) => canCreatePaidCheckout(subscription, plan.slug)),
        [subscription]
    );
    const effectiveSelectedPlan = checkoutPlans.some(({ slug }) => slug === selectedPlan)
        ? selectedPlan
        : checkoutPlans[0]?.slug || null;
    const currentPeriodEnd = formatDate(subscription?.currentPeriodEnd);
    const openBillingPortal = async () => {
        setPortalState("loading");
        setPortalError("");
        try {
            const data = await createCustomerPortalSession();
            const portal = normalizePortalSession(data);
            if (!portal) throw new Error("Invalid billing portal response");
            setPortalState("redirecting");
            window.location.assign(portal.portalUrl);
        } catch (error) {
            setPortalState("error");
            setPortalError(getSafeBillingPortalError(error));
        }
    };

    return (
        <section className="rounded-[28px] border bg-white p-6 md:p-7" style={cardStyle} aria-labelledby="billing-heading">
            <CheckoutReturnNotice
                marker={marker}
                state={displayState}
                subscription={subscription}
                targetPlan={targetPlan}
                onRefresh={() => setLoadAttempt((value) => value + 1)}
            />

            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "#787585" }}>Billing</p>
                    <h2 id="billing-heading" className="mt-2 text-2xl font-black" style={{ color: "#1a1930" }}>Plan and scan allowance</h2>
                </div>
                {subscription && (
                    <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: "#e4dfff", color: "#5845cb" }}>
                        {getSubscriptionStatusLabel(subscription.status)}
                    </span>
                )}
            </div>

            {displayState === "loading" && (
                <div className="mt-6 h-44 animate-pulse rounded-2xl bg-[#eeeaf7]" role="status"><span className="sr-only">Loading subscription</span></div>
            )}

            {(displayState === "error" || displayState === "invalid") && (
                <div className="mt-6 rounded-2xl p-5" style={{ background: "#fff2f2" }} role="alert">
                    <p className="font-bold" style={{ color: "#8f1d1d" }}>Subscription status unavailable</p>
                    <p className="mt-1 text-sm" style={{ color: "#8f1d1d" }}>Checkout stays disabled until your current plan can be verified.</p>
                    <button type="button" onClick={() => setLoadAttempt((value) => value + 1)} className="mt-4 rounded-full px-5 py-2.5 text-sm font-bold" style={{ background: "#8f1d1d", color: "#fff" }}>
                        Try again
                    </button>
                </div>
            )}

            {(displayState === "success" || displayState === "verifying") && subscription && (
                <>
                    <div className="mt-6 rounded-2xl p-5" style={{ background: "#f6f3ff" }}>
                        <div className="flex flex-wrap items-baseline justify-between gap-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#787585" }}>Current plan</p>
                                <p className="mt-1 text-3xl font-black capitalize" style={{ color: "#5845cb" }}>{subscription.plan}</p>
                            </div>
                            <p className="text-sm font-semibold" style={{ color: "#474554" }}>{subscription.scanLimit} scan{subscription.scanLimit === 1 ? "" : "s"} per month</p>
                        </div>
                        {subscription.effectivePlan !== subscription.plan && (
                            <p className="mt-3 text-sm font-semibold" style={{ color: "#8a5c00" }}>
                                Effective access: <span className="capitalize">{subscription.effectivePlan}</span>. Access is controlled by the latest verified billing state.
                            </p>
                        )}
                        {currentPeriodEnd && (
                            <p className="mt-3 text-sm" style={{ color: "#474554" }}>
                                {subscription.cancelAtPeriodEnd ? "Access is scheduled to end" : "Current billing period ends"} on {currentPeriodEnd}.
                            </p>
                        )}
                        {["on_hold", "past_due", "failed", "paused"].includes(subscription.status) && (
                            <p className="mt-3 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: "#fff2f2", color: "#8f1d1d" }}>
                                Billing needs attention. Use Manage billing to review payment details with Dodo.
                            </p>
                        )}
                        {subscription.status === "cancelled" && (
                            <p className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: "#fff9e8", color: "#6f5100" }}>
                                This subscription is cancelled. Your effective access follows the verified end date above.
                            </p>
                        )}
                        {subscription.canManageBilling && (
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={openBillingPortal}
                                    disabled={portalState === "loading" || portalState === "redirecting"}
                                    className="rounded-full border px-5 py-2.5 text-sm font-bold disabled:cursor-wait disabled:opacity-60"
                                    style={{ borderColor: "#5845cb", color: "#5845cb", background: "#fff" }}
                                >
                                    {portalState === "loading" ? "Opening billing…" : portalState === "redirecting" ? "Redirecting…" : "Manage billing"}
                                </button>
                                <span className="text-xs" style={{ color: "#787585" }}>Securely hosted by Dodo Payments</span>
                            </div>
                        )}
                        {portalError && <p className="mt-3 text-sm font-semibold" style={{ color: "#ba1a1a" }} role="alert">{portalError}</p>}
                    </div>

                    <div className="mt-7">
                        <h3 className="text-lg font-black" style={{ color: "#1a1930" }}>Available plans</h3>
                        <p className="mt-1 text-sm" style={{ color: "#787585" }}>Every plan includes the same result and routine features; only the monthly scan allowance changes.</p>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {BILLING_PLANS.map((plan) => {
                            const current = plan.slug === currentPlan;
                            const eligible = canCreatePaidCheckout(subscription, plan.slug);
                            const selected = eligible && effectiveSelectedPlan === plan.slug;
                            return (
                                <button
                                    key={plan.slug}
                                    type="button"
                                    disabled={!eligible || isCheckoutBusy}
                                    aria-pressed={selected}
                                    onClick={() => {
                                        resetCheckoutError();
                                        setSelectedPlan(plan.slug);
                                    }}
                                    className="rounded-2xl p-4 text-left transition disabled:cursor-not-allowed"
                                    style={{
                                        border: selected ? "2px solid #5845cb" : "1px solid rgba(200,196,214,0.7)",
                                        background: current ? "#efebff" : "#fff",
                                        opacity: !eligible && !current ? 0.55 : 1,
                                    }}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-black" style={{ color: "#1a1930" }}>{plan.name}</p>
                                        {current && <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#5845cb" }}>Current</span>}
                                    </div>
                                    <p className="mt-2 text-2xl font-black" style={{ color: "#5845cb" }}>{plan.price}<span className="text-xs font-semibold">{plan.period}</span></p>
                                    <p className="mt-2 text-xs font-semibold" style={{ color: "#787585" }}>{plan.scans} scan{plan.scans === 1 ? "" : "s"} monthly</p>
                                </button>
                            );
                        })}
                    </div>

                    {checkoutPlans.length > 0 ? (
                        <button
                            type="button"
                            onClick={() => effectiveSelectedPlan && startCheckout(effectiveSelectedPlan)}
                            disabled={!effectiveSelectedPlan || isCheckoutBusy || displayState === "verifying"}
                            className="glow-button mt-6 w-full rounded-full px-6 py-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-65 sm:w-auto"
                            style={{ color: "#fff", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                        >
                            {isCheckoutBusy
                                ? checkoutState === "redirecting" ? "Opening secure checkout…" : `Preparing ${checkoutPlan || ""} checkout…`
                                : `Continue to ${BILLING_PLAN_BY_SLUG[effectiveSelectedPlan]?.name || "secure checkout"}`}
                        </button>
                    ) : (
                        <p className="mt-6 rounded-2xl p-4 text-sm font-semibold" style={{ background: "#efebff", color: "#5845cb" }}>
                            A paid subscription is already linked to this account. Additional paid checkouts are disabled to prevent a duplicate subscription. Your current access remains server-controlled.
                        </p>
                    )}

                    <p className="mt-4 text-xs" style={{ color: "#787585" }}>
                        Checkout opens only after you press Continue. Prices are shown in USD and the browser sends only your selected plan to TejAi.
                    </p>
                    {checkoutError && <p className="mt-3 text-sm font-semibold" style={{ color: "#ba1a1a" }} role="alert">{checkoutError}</p>}
                </>
            )}
        </section>
    );
}

function SettingsContent() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const [marker] = useState(() => getCheckoutMarker(searchParams));
    const [requestedPlan] = useState(() => getPlanFromSearch(searchParams));

    return (
        <AppLayout>
            <div className="min-h-screen px-5 py-9 sm:px-8 lg:px-12 lg:py-11">
                <div className="mx-auto w-full max-w-5xl">
                    <header className="mb-8">
                        <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "#787585" }}>Account</p>
                        <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl" style={{ color: "#1a1930" }}>Settings</h1>
                        <p className="mt-2 text-base" style={{ color: "#787585" }}>Manage your identity, security, and server-verified plan.</p>
                    </header>

                    <div className="grid gap-5">
                        <BillingSection marker={marker} requestedPlan={requestedPlan} />

                        <section className="rounded-[28px] border bg-white p-6 md:p-7" style={cardStyle}>
                            <h2 className="text-xl font-black" style={{ color: "#1a1930" }}>Profile</h2>
                            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                                <div>
                                    <dt className="text-xs font-bold uppercase tracking-wider" style={{ color: "#787585" }}>Email</dt>
                                    <dd className="mt-1 break-all font-semibold" style={{ color: "#1a1930" }}>{user?.email}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-bold uppercase tracking-wider" style={{ color: "#787585" }}>Email status</dt>
                                    <dd className="mt-1 font-semibold" style={{ color: user?.email_confirmed_at ? "#1a6645" : "#8a5c00" }}>
                                        {user?.email_confirmed_at ? "Confirmed" : "Confirmation pending"}
                                    </dd>
                                </div>
                            </dl>
                        </section>

                        <section className="rounded-[28px] border bg-white p-6 md:p-7" style={cardStyle}>
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-black" style={{ color: "#1a1930" }}>Security</h2>
                                    <p className="mt-1 text-sm" style={{ color: "#787585" }}>Update your password through a secure authenticated flow.</p>
                                </div>
                                <Link href="/reset-password" className="rounded-full bg-[#e9e5ff] px-5 py-3 text-sm font-bold text-[#5845cb]">
                                    Change password
                                </Link>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}

export default function SettingsPage() {
    return (
        <Suspense fallback={<SettingsLoading />}>
            <SettingsContent />
        </Suspense>
    );
}
