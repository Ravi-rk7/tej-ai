"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
    getPasswordRuleResults,
    getSafeAuthError,
    validatePassword,
} from "@/lib/authValidation";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
    const router = useRouter();
    const { loading: sessionLoading, session } = useAuth();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const passwordRuleResults = getPasswordRuleResults(password);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");

        const passwordError = validatePassword(password);
        if (passwordError) {
            setError(passwordError);
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        const { error: updateError } = await supabase.auth.updateUser({ password });

        if (updateError) {
            setError(getSafeAuthError(updateError, "We could not update your password. Request a new reset link and try again."));
            setLoading(false);
            return;
        }

        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
            await supabase.auth.signOut({ scope: "local" });
        }
        router.replace("/login?password=updated");
    };

    if (sessionLoading) {
        return (
            <main className="min-h-screen flex items-center justify-center" style={{ background: "#fcf8ff" }}>
                <p className="text-sm font-semibold" style={{ color: "#474554" }}>Checking your reset link...</p>
            </main>
        );
    }

    if (!session) {
        return (
            <main className="min-h-screen px-5 py-16" style={{ background: "#fcf8ff" }}>
                <section className="mx-auto mt-10 max-w-md rounded-[30px] bg-white p-8 text-center">
                    <h1 className="text-3xl font-black" style={{ color: "#1a1930" }}>Reset link expired</h1>
                    <p className="mt-3 text-sm" style={{ color: "#474554" }}>
                        This link is invalid or has expired. Request a fresh password reset email.
                    </p>
                    <Link href="/forgot-password" className="glow-button mt-6 inline-flex rounded-full px-6 py-3 font-bold text-white">
                        Request a new link
                    </Link>
                </section>
            </main>
        );
    }

    return (
        <main className="min-h-screen px-5 py-16" style={{ background: "#fcf8ff" }}>
            <section className="mx-auto mt-10 w-full max-w-md rounded-[30px] bg-white p-7 shadow-xl sm:p-8">
                <div className="mb-7 text-center">
                    <h1 className="text-3xl font-black" style={{ color: "#1a1930" }}>Choose a New Password</h1>
                    <p className="mt-2 text-sm" style={{ color: "#474554" }}>Use a strong password you do not use elsewhere.</p>
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                    <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="New password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        required
                        className="w-full rounded-2xl border px-4 py-3.5 text-sm outline-none"
                    />
                    <ul className="grid grid-cols-1 gap-1 px-1 sm:grid-cols-2" aria-label="Password requirements">
                        {passwordRuleResults.map(({ label, passed }) => (
                            <li key={label} className="text-xs font-medium" style={{ color: passed ? "#1a6645" : "#787585" }}>
                                {passed ? "✓" : "○"} {label}
                            </li>
                        ))}
                    </ul>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        required
                        className="w-full rounded-2xl border px-4 py-3.5 text-sm outline-none"
                    />
                    {error && <p className="text-sm font-semibold text-[#ba1a1a]">{error}</p>}
                    <button type="submit" disabled={loading} className="glow-button w-full rounded-full px-6 py-4 font-bold text-white disabled:opacity-70">
                        {loading ? "Updating..." : "Update Password"}
                    </button>
                </form>
            </section>
        </main>
    );
}
