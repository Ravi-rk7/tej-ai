"use client";

import { useCallback, useState } from "react";
import ScanUploader from "@/components/scan/ScanUploader";
import PaywallModal from "@/components/paywall/PaywallModal";

export default function ScanFlow() {
    const [showPaywall, setShowPaywall] = useState(false);

    // Called when the API returns a 403 scan-limit error
    const handleLimitReached = useCallback(() => {
        setShowPaywall(true);
    }, []);

    return (
        <>
            <ScanUploader
                onLimitReached={handleLimitReached}
            />
            <PaywallModal
                open={showPaywall}
                onClose={() => setShowPaywall(false)}
                onUnlock={() => setShowPaywall(false)}
            />
        </>
    );
}
