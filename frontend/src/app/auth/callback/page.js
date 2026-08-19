"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

export default function AuthCallbackPage() {
    const router = useRouter();
    const { loading, session } = useAuth();
    const failed = !loading && !session;

    useEffect(() => {
        if (loading) return;

        if (!session) return;

        const requestedPath = new URLSearchParams(window.location.search).get("next");
        const destination = requestedPath?.startsWith("/")
            && !requestedPath.startsWith("//")
            ? requestedPath
            : "/dashboard";
        router.replace(destination);
    }, [loading, router, session]);

    return (
        <main className="min-h-screen flex items-center justify-center px-5" style={{ background: "#fcf8ff" }}>
            <section className="w-full max-w-md rounded-[30px] bg-white p-8 text-center">
                {failed ? (
                    <>
                        <h1 className="text-2xl font-black" style={{ color: "#1a1930" }}>Confirmation link expired</h1>
                        <p className="mt-3 text-sm" style={{ color: "#474554" }}>Sign in or create your account again to receive a new link.</p>
                        <Link href="/login" className="mt-6 inline-flex font-bold" style={{ color: "#5845cb" }}>Go to sign in</Link>
                    </>
                ) : (
                    <>
                        <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-[#e4dfff] border-t-[#5845cb]" />
                        <p className="mt-4 text-sm font-semibold" style={{ color: "#474554" }}>Confirming your account...</p>
                    </>
                )}
            </section>
        </main>
    );
}
