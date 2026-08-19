"use client";

import Link from "next/link";
import { useState } from "react";
import { GuestOnly } from "@/components/auth/AuthProvider";
import { requestPasswordReset } from "@/lib/api";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        setSuccess("");
        setLoading(true);

        try {
            const data = await requestPasswordReset(email.trim());
            setSuccess(data.message);
        } catch (requestError) {
            setError(
                requestError?.message
                || "We could not send a reset email. Please wait and try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <GuestOnly>
            <main className="min-h-screen px-5 py-16" style={{ background: "#fcf8ff" }}>
                <section
                    className="mx-auto mt-10 w-full max-w-md rounded-[30px] p-7 sm:p-8"
                    style={{
                        background: "rgba(255,255,255,0.9)",
                        border: "1px solid rgba(200,196,214,0.42)",
                        boxShadow: "0 24px 70px -28px rgba(88,69,203,0.35)",
                    }}
                >
                    <div className="mb-7 text-center">
                        <h1 className="text-3xl font-black" style={{ color: "#1a1930" }}>
                            Reset Your Password
                        </h1>
                        <p className="mt-2 text-sm" style={{ color: "#474554" }}>
                            We&apos;ll email a secure reset link if the account exists.
                        </p>
                    </div>

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="Email address"
                            autoComplete="email"
                            required
                            className="w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition"
                            style={{
                                borderColor: "rgba(200,196,214,0.65)",
                                background: "#fff",
                                color: "#1a1930",
                            }}
                        />

                        {error && <p className="text-sm font-semibold text-[#ba1a1a]">{error}</p>}
                        {success && <p className="text-sm font-semibold text-[#1a6645]">{success}</p>}

                        <button
                            type="submit"
                            disabled={loading || Boolean(success)}
                            className="glow-button w-full rounded-full px-6 py-4 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {loading ? "Sending..." : "Send Reset Link"}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-sm" style={{ color: "#474554" }}>
                        <Link href="/login" className="font-bold" style={{ color: "#5845cb" }}>
                            Back to sign in
                        </Link>
                    </p>
                </section>
            </main>
        </GuestOnly>
    );
}
