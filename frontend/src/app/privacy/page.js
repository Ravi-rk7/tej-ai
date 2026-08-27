import LegalPage from "@/components/layout/LegalPage";
import { LEGAL_CONFIG } from "@/lib/legalConfig";

export const metadata = {
    title: "Privacy Notice — TejAi",
    description: "How TejAi processes face photos, scan results, account data, and billing information.",
};

const businessName = LEGAL_CONFIG.legalBusinessName || LEGAL_CONFIG.brandName;

export default function PrivacyPage() {
    return (
        <LegalPage eyebrow="Privacy" title="Privacy Notice" summary="This notice explains what TejAi processes, why it is needed, which providers receive it, how long it is kept, and how you can exercise your choices.">
            <section>
                <h2>Who is responsible</h2>
                <p className="mt-3">{businessName} operates TejAi. {LEGAL_CONFIG.operatingCountry ? `The service operates from ${LEGAL_CONFIG.operatingCountry}.` : "The operating-country disclosure is pending legal approval."} {LEGAL_CONFIG.businessAddress ? `Business address: ${LEGAL_CONFIG.businessAddress}.` : "A business address will be published if required."}</p>
                <p className="mt-3">Effective date: {LEGAL_CONFIG.privacyEffectiveDate || "pending legal approval"}.</p>
            </section>

            <section>
                <h2>Information we process</h2>
                <ul className="mt-3">
                    <li>Account information such as your email address, authentication identifiers, and session information.</li>
                    <li>A JPG face photograph that you explicitly choose to submit for one scan.</li>
                    <li>Derived cosmetic results including skin type, Glow Score, concern scores, routine steps, and result timestamps.</li>
                    <li>Subscription status, plan, checkout references, and limited billing-event records. Dodo Payments collects and manages payment details on its hosted pages.</li>
                    <li>Limited security and service logs needed to operate and protect the application.</li>
                </ul>
            </section>

            <section>
                <h2>Face-photo processing and consent</h2>
                <p className="mt-3">Before the uploader is enabled, TejAi asks for a clear affirmative choice. The photograph is held in transient server memory, sent over an encrypted connection to AILabTools for cosmetic skin analysis, and released after the request succeeds or fails. TejAi does not save the image, its filename, a base64 copy, or the provider&apos;s raw response.</p>
                <p className="mt-3">AILabTools documents that uploaded Skin Analyze Pro files are not stored. You can withdraw face-scan consent in Settings. Withdrawal prevents future scans but does not automatically erase results you previously chose to save.</p>
            </section>

            <section>
                <h2>Service providers and disclosures</h2>
                <ul className="mt-3">
                    <li><a href="https://supabase.com/privacy" target="_blank" rel="noreferrer">Supabase</a> provides authentication and database infrastructure.</li>
                    <li><a href="https://www.ailabtools.com/docs/file-storage-policy" target="_blank" rel="noreferrer">AILabTools</a> receives the selected face photograph to return cosmetic analysis scores.</li>
                    <li><a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noreferrer">OpenAI</a> receives only derived skin type and concern key/severity. It does not receive the photograph, email, filename, TejAi user ID, or raw AILabTools response. OpenAI states that API data is not used for training by default; ordinary abuse-monitoring logs may be retained for up to 30 days unless enhanced retention controls apply.</li>
                    <li><a href="https://dodopayments.com/privacy-policy" target="_blank" rel="noreferrer">Dodo Payments</a> hosts checkout and billing management and may retain payment or transaction records where required by law.</li>
                </ul>
                <p className="mt-3">We describe processor disclosures accurately instead of making an absolute third-party-sharing promise.</p>
            </section>

            <section>
                <h2>Retention and deletion</h2>
                <ul className="mt-3">
                    <li>Face bytes: only for the active analysis request; not stored by TejAi.</li>
                    <li>Saved results and routines: until you delete the scan or your account.</li>
                    <li>Consent history: while the account exists.</li>
                    <li>Pseudonymous deletion evidence and billing tombstones: 365 days, subject to final legal approval or a longer period required by law.</li>
                    <li>OpenAI derived request content: subject to its API data controls, ordinarily up to 30 days in abuse-monitoring logs.</li>
                    <li>Dodo payment records: according to applicable tax, payment, fraud-prevention, and record-retention obligations.</li>
                </ul>
                <p className="mt-3">You can delete an individual result from History or Results. Settings provides consent withdrawal and permanent account deletion. Account deletion cancels a linked paid subscription before removing the TejAi authentication account and user-owned application records.</p>
            </section>

            <section>
                <h2>Browser storage and cookies</h2>
                <p className="mt-3">TejAi uses browser storage required to maintain your Supabase authentication session. The current TejAi application does not include advertising or behavioral-analytics trackers. Dodo&apos;s separately hosted checkout and portal are governed by Dodo&apos;s own storage and cookie disclosures.</p>
            </section>

            <section>
                <h2>Your choices and contact</h2>
                <p className="mt-3">You may withdraw consent, delete saved scans, delete your account, or ask a privacy question. {LEGAL_CONFIG.privacyEmail ? <>Contact <a href={`mailto:${LEGAL_CONFIG.privacyEmail}`}>{LEGAL_CONFIG.privacyEmail}</a>.</> : "A verified privacy contact must be configured before launch."}</p>
            </section>
        </LegalPage>
    );
}
