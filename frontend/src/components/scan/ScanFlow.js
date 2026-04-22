"use client";

import { useCallback, useState } from "react";
import ScanUploader from "@/components/scan/ScanUploader";
import PaywallModal from "@/components/paywall/PaywallModal";

const FIRST_SCAN_KEY = "tejai_first_scan_completed";

export default function ScanFlow() {
    const [showPaywall, setShowPaywall] = useState(false);

    const handleFirstScanComplete = useCallback(() => {
        if (typeof window === "undefined") return;

        const hasScannedBefore = window.localStorage.getItem(FIRST_SCAN_KEY) === "1";
        if (hasScannedBefore) return;

        window.localStorage.setItem(FIRST_SCAN_KEY, "1");
        setShowPaywall(true);
    }, []);

    return (
        <>
            <ScanUploader onScanComplete={handleFirstScanComplete} />
            <PaywallModal
                open={showPaywall}
                onClose={() => setShowPaywall(false)}
                onUnlock={() => setShowPaywall(false)}
            />
        </>
    );
}
