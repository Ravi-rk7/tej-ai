import LegalPage from "@/components/layout/LegalPage";
import { LEGAL_CONFIG } from "@/lib/legalConfig";

export const metadata = {
    title: "Terms of Service — TejAi",
    description: "Terms for using TejAi cosmetic wellness scans and routines.",
};

export default function TermsPage() {
    return (
        <LegalPage eyebrow="Terms" title="Terms of Service" summary="These terms govern access to TejAi accounts, cosmetic wellness scans, saved results, routines, and subscriptions.">
            <section>
                <h2>Eligibility and accounts</h2>
                <p className="mt-3">TejAi is currently intended only for people aged 18 or older. You are responsible for keeping your account credentials secure and for activity performed through your account.</p>
            </section>
            <section>
                <h2>Cosmetic wellness scope</h2>
                <p className="mt-3">TejAi provides automated cosmetic skin observations and general skincare routine guidance. It is not a medical device, diagnosis, treatment plan, emergency service, or replacement for a qualified clinician. Results can be incomplete or incorrect. Seek professional advice for persistent, severe, painful, changing, or otherwise concerning symptoms.</p>
            </section>
            <section>
                <h2>Your photographs and permitted use</h2>
                <p className="mt-3">Submit only a photograph of yourself that you are authorized to process. Do not upload another person&apos;s image. You grant TejAi the limited permission needed to transmit and process the selected photograph for the scan you requested.</p>
            </section>
            <section>
                <h2>Subscriptions and billing</h2>
                <p className="mt-3">Plan prices, currency, and monthly scan allowances are shown before checkout. Dodo Payments hosts checkout and billing management. Plan access is activated only after TejAi receives verified billing state. Account deletion immediately cancels a linked paid subscription and ends access; any refund rights remain subject to the checkout terms and applicable law.</p>
            </section>
            <section>
                <h2>Safe use</h2>
                <p className="mt-3">Patch-test new products, use broad-spectrum SPF 30+ every morning, follow product labels, and stop use if irritation occurs. Pregnancy, breastfeeding, allergies, medications, and sensitive skin may require professional advice before changing a routine.</p>
            </section>
            <section>
                <h2>Availability and responsibility</h2>
                <p className="mt-3">The service may change, experience interruptions, or reject images that do not meet quality requirements. Nothing in these terms excludes rights or responsibilities that cannot legally be excluded. Final warranty, liability, dispute, and refund language requires legal approval before launch.</p>
            </section>
            <section>
                <h2>Termination and governing law</h2>
                <p className="mt-3">You may stop using TejAi or delete your account in Settings. We may restrict abusive, fraudulent, unsafe, or unlawful use. Governing law: {LEGAL_CONFIG.governingLaw || "pending legal approval"}.</p>
            </section>
            <section>
                <h2>Contact</h2>
                <p className="mt-3">{LEGAL_CONFIG.supportEmail ? <>Questions may be sent to <a href={`mailto:${LEGAL_CONFIG.supportEmail}`}>{LEGAL_CONFIG.supportEmail}</a>.</> : "A verified support contact must be configured before launch."}</p>
            </section>
        </LegalPage>
    );
}
