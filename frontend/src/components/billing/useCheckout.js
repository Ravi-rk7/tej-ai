"use client";

import { useCallback, useRef, useState } from "react";
import { createCheckoutSession } from "@/lib/api";
import {
    clearCheckoutAttempt,
    getOrCreateCheckoutAttempt,
    getSafeCheckoutError,
    isPaidPlan,
    normalizeCheckoutSession,
    shouldPreserveCheckoutAttempt,
} from "@/lib/billingData";

export default function useCheckout() {
    const [checkoutState, setCheckoutState] = useState("idle");
    const [checkoutError, setCheckoutError] = useState(null);
    const [checkoutPlan, setCheckoutPlan] = useState(null);
    const busyRef = useRef(false);

    const startCheckout = useCallback(async (plan) => {
        if (!isPaidPlan(plan) || busyRef.current) return false;

        let attempt;
        try {
            attempt = getOrCreateCheckoutAttempt({ plan });
        } catch {
            setCheckoutError("This browser could not create a secure checkout request. Please try another browser.");
            setCheckoutState("error");
            return false;
        }

        if (!attempt) {
            setCheckoutError("This browser could not create a secure checkout request. Please try another browser.");
            setCheckoutState("error");
            return false;
        }

        if (attempt.blocked) {
            const existingName = attempt.plan[0].toUpperCase() + attempt.plan.slice(1);
            setCheckoutPlan(attempt.plan);
            setCheckoutError(`A ${existingName} checkout may still be unresolved. Retry that plan or finish/cancel it before choosing another plan.`);
            setCheckoutState("blocked");
            return false;
        }

        busyRef.current = true;
        setCheckoutPlan(plan);
        setCheckoutError(null);
        setCheckoutState("creating");

        try {
            const rawSession = await createCheckoutSession(plan, {
                idempotencyKey: attempt.idempotencyKey,
            });
            const session = normalizeCheckoutSession(rawSession);
            if (!session) {
                throw new Error("Invalid checkout response");
            }

            setCheckoutState("redirecting");
            window.location.assign(session.checkoutUrl);
            return true;
        } catch (error) {
            busyRef.current = false;
            if (!shouldPreserveCheckoutAttempt(error)) clearCheckoutAttempt();
            setCheckoutError(getSafeCheckoutError(error));
            setCheckoutState("error");
            return false;
        }
    }, []);

    const resetCheckoutError = useCallback(() => {
        if (busyRef.current) return;
        setCheckoutError(null);
        setCheckoutState("idle");
    }, []);

    return {
        checkoutError,
        checkoutPlan,
        checkoutState,
        isCheckoutBusy: checkoutState === "creating" || checkoutState === "redirecting",
        resetCheckoutError,
        startCheckout,
    };
}
