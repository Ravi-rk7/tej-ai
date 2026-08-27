import Link from "next/link";
import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";
import { isLegalConfigComplete } from "@/lib/legalConfig";

export function LegalNoticeDraftBanner() {
    if (isLegalConfigComplete()) return null;
    return (
        <div className="mb-7 rounded-2xl border p-4 text-sm leading-6" style={{ background: "#fff8e7", borderColor: "#e5c875", color: "#6b4c00" }} role="note">
            This is an engineering draft. Verified business contact, jurisdiction, effective-date, and legal-review details are still required before launch.
        </div>
    );
}

export default function LegalPage({ eyebrow, title, summary, children }) {
    return (
        <div className="min-h-screen" style={{ background: "#fcf8ff" }}>
            <Navbar />
            <main className="mx-auto w-full max-w-4xl px-5 pb-20 pt-32 sm:px-8">
                <Link href="/" className="text-sm font-bold text-[#5845cb]">← Back to TejAi</Link>
                <header className="mb-8 mt-7">
                    <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "#787585" }}>{eyebrow}</p>
                    <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl" style={{ color: "#1a1930" }}>{title}</h1>
                    <p className="mt-4 max-w-3xl text-base leading-7" style={{ color: "#474554" }}>{summary}</p>
                </header>
                <LegalNoticeDraftBanner />
                <article className="grid gap-7 rounded-[28px] border bg-white p-6 sm:p-9 [&_a]:font-semibold [&_a]:text-[#5845cb] [&_a]:underline [&_h2]:text-2xl [&_h2]:font-black [&_h2]:text-[#1a1930] [&_li]:leading-7 [&_p]:leading-7 [&_p]:text-[#474554] [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5" style={{ borderColor: "rgba(200,196,214,0.5)" }}>
                    {children}
                </article>
            </main>
            <Footer />
        </div>
    );
}
