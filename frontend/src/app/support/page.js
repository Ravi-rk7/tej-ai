import LegalPage from "@/components/layout/LegalPage";
import { LEGAL_CONFIG } from "@/lib/legalConfig";

export const metadata = {
    title: "Support — TejAi",
    description: "Contact TejAi about accounts, privacy, scans, and billing.",
};

export default function SupportPage() {
    return (
        <LegalPage eyebrow="Help" title="Support and contact" summary="Use the appropriate contact below for account, privacy, scan, or billing questions. Never email passwords, API keys, access tokens, or face photographs.">
            <section>
                <h2>Product and account support</h2>
                <p className="mt-3">{LEGAL_CONFIG.supportEmail ? <>Email <a href={`mailto:${LEGAL_CONFIG.supportEmail}`}>{LEGAL_CONFIG.supportEmail}</a>. Include a short description and the time of the issue, but do not attach a face photograph.</> : "A verified support email is pending. This draft page must not be launched until that contact is configured."}</p>
            </section>
            <section>
                <h2>Privacy requests</h2>
                <p className="mt-3">Consent can be withdrawn and accounts can be deleted directly in Settings. {LEGAL_CONFIG.privacyEmail ? <>For another privacy request, email <a href={`mailto:${LEGAL_CONFIG.privacyEmail}`}>{LEGAL_CONFIG.privacyEmail}</a> from the address associated with your account.</> : "A verified privacy email is pending legal approval."}</p>
            </section>
            <section>
                <h2>Billing</h2>
                <p className="mt-3">Open Settings and choose Manage billing to view payment methods, invoices, or subscription cancellation on Dodo Payments&apos; hosted portal. Do not send card information to TejAi support.</p>
            </section>
            <section>
                <h2>Urgent health concerns</h2>
                <p className="mt-3">TejAi does not provide medical or emergency support. Contact a qualified healthcare professional or local emergency service when appropriate.</p>
            </section>
        </LegalPage>
    );
}
