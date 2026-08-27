"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ScanUploader from "@/components/scan/ScanUploader";
import PaywallModal from "@/components/paywall/PaywallModal";
import { getPrivacyStatus, grantPrivacyConsent } from "@/lib/api";
import { normalizePrivacyStatus } from "@/lib/privacyData";

function ConsentStatusCard({ title, message, actionLabel, onAction }) {
    return (
        <div className="rounded-2xl border p-5 text-center" style={{ background: "#f7f4ff", borderColor: "rgba(200,196,214,0.55)" }} role="status">
            <p className="font-black" style={{ color: "#1a1930" }}>{title}</p>
            <p className="mt-2 text-sm leading-6" style={{ color: "#474554" }}>{message}</p>
            {actionLabel && <button type="button" onClick={onAction} className="mt-4 rounded-full px-5 py-2.5 text-sm font-bold" style={{ background: "#5845cb", color: "#fff" }}>{actionLabel}</button>}
        </div>
    );
}

function FaceScanConsent({ status, onGranted }) {
    const [faceConsent, setFaceConsent] = useState(false);
    const [adultConfirmed, setAdultConfirmed] = useState(false);
    const [submitState, setSubmitState] = useState("idle");
    const [error, setError] = useState("");

    const submit = async () => {
        if (!faceConsent || !adultConfirmed || submitState === "saving") return;
        setSubmitState("saving");
        setError("");
        try {
            const payload = await grantPrivacyConsent({ noticeVersion: status.noticeVersion });
            const normalized = normalizePrivacyStatus(payload);
            if (!normalized?.granted) throw new Error("Consent status could not be confirmed");
            onGranted(normalized);
        } catch (requestError) {
            setSubmitState("error");
            setError(requestError?.message || "Consent could not be saved. Please try again.");
        }
    };

    return (
        <section className="rounded-3xl border p-5 sm:p-6" style={{ background: "#fff", borderColor: "rgba(200,196,214,0.55)" }} aria-labelledby="face-consent-heading">
            <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "#787585" }}>Before your first scan</p>
            <h2 id="face-consent-heading" className="mt-2 text-2xl font-black" style={{ color: "#1a1930" }}>Choose whether to process a face photo</h2>
            <p className="mt-3 text-sm leading-6" style={{ color: "#474554" }}>
                Your JPG is sent securely to AILabTools for cosmetic skin analysis. TejAi keeps it only in memory during the request and does not store it. Derived skin type and concern severity may be sent to OpenAI to build a cosmetic wellness routine; your photo and identity are not sent to OpenAI.
            </p>
            <div className="mt-5 grid gap-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4" style={{ borderColor: faceConsent ? "#5845cb" : "rgba(200,196,214,0.65)", background: faceConsent ? "#f3f0ff" : "#fff" }}>
                    <input type="checkbox" checked={faceConsent} onChange={(event) => setFaceConsent(event.target.checked)} className="mt-1 h-4 w-4" />
                    <span className="text-sm leading-6" style={{ color: "#1a1930" }}>I consent to processing one face photo for cosmetic skin analysis and understand the provider disclosures above.</span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4" style={{ borderColor: adultConfirmed ? "#5845cb" : "rgba(200,196,214,0.65)", background: adultConfirmed ? "#f3f0ff" : "#fff" }}>
                    <input type="checkbox" checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.target.checked)} className="mt-1 h-4 w-4" />
                    <span className="text-sm leading-6" style={{ color: "#1a1930" }}>I confirm that I am at least 18 years old.</span>
                </label>
            </div>
            <p className="mt-4 text-xs leading-5" style={{ color: "#787585" }}>
                Review the <Link href="/privacy" className="font-bold text-[#5845cb] underline">Privacy Notice</Link> and <Link href="/terms" className="font-bold text-[#5845cb] underline">Terms</Link>. You can withdraw consent later in Settings; withdrawal stops future scans but does not delete saved results.
            </p>
            {error && <p className="mt-4 text-sm font-semibold" style={{ color: "#ba1a1a" }} role="alert">{error}</p>}
            <button type="button" onClick={submit} disabled={!faceConsent || !adultConfirmed || submitState === "saving"} className="mt-5 w-full rounded-full px-6 py-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "#5845cb", color: "#fff" }}>
                {submitState === "saving" ? "Saving consent…" : "I consent and want to continue"}
            </button>
        </section>
    );
}

export default function ScanFlow() {
    const [showPaywall, setShowPaywall] = useState(false);
    const [privacyState, setPrivacyState] = useState("loading");
    const [privacyStatus, setPrivacyStatus] = useState(null);
    const [privacyAttempt, setPrivacyAttempt] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        getPrivacyStatus({ signal: controller.signal })
            .then((payload) => {
                const normalized = normalizePrivacyStatus(payload);
                if (!normalized) throw new Error("Invalid privacy status");
                setPrivacyStatus(normalized);
                setPrivacyState(normalized.granted ? "ready" : "required");
            })
            .catch((error) => {
                if (error?.name === "AbortError") return;
                setPrivacyStatus(null);
                setPrivacyState("error");
            });
        return () => controller.abort();
    }, [privacyAttempt]);

    // Called when the API returns a 403 scan-limit error
    const handleLimitReached = useCallback(() => {
        setShowPaywall(true);
    }, []);

    const requireConsentAgain = useCallback(() => {
        setPrivacyState("loading");
        setPrivacyAttempt((value) => value + 1);
    }, []);

    const retryPrivacyStatus = useCallback(() => {
        setPrivacyState("loading");
        setPrivacyAttempt((value) => value + 1);
    }, []);

    return (
        <>
            {privacyState === "loading" && <ConsentStatusCard title="Checking your privacy choice" message="The uploader will open only after your current consent status is verified." />}
            {privacyState === "error" && <ConsentStatusCard title="Privacy settings unavailable" message="No photo has been selected or uploaded. Try again when privacy preferences are available." actionLabel="Try again" onAction={retryPrivacyStatus} />}
            {privacyState === "required" && privacyStatus && <FaceScanConsent status={privacyStatus} onGranted={(status) => { setPrivacyStatus(status); setPrivacyState("ready"); }} />}
            {privacyState === "ready" && (
                <ScanUploader
                    onLimitReached={handleLimitReached}
                    onConsentRequired={requireConsentAgain}
                />
            )}
            <PaywallModal
                open={showPaywall}
                onClose={() => setShowPaywall(false)}
            />
        </>
    );
}
