"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GuestOnly } from "@/components/auth/AuthProvider";
import {
    getPasswordRuleResults,
    getSafeAuthError,
    validatePassword,
} from "@/lib/authValidation";
import { supabase } from "@/lib/supabaseClient";
import { buildAuthPath, getNextFromSearch } from "@/lib/authRedirect";

function AuthInput(props) {
    return (
        <input
            {...props}
            className="w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition"
            style={{
                borderColor: "rgba(200,196,214,0.65)",
                background: "#fff",
                color: "#1a1930",
                fontFamily: "'Inter', sans-serif",
            }}
        />
    );
}

function AuthButton({ loading, children }) {
    return (
        <button
            type="submit"
            disabled={loading}
            className="glow-button w-full rounded-full px-6 py-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-70"
            style={{
                color: "#fff",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
        >
            {loading ? "Creating account..." : children}
        </button>
    );
}

function SignupContent() {
    const searchParams = useSearchParams();
    const nextPath = getNextFromSearch(searchParams);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        setSuccess("");

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
            setError(passwordError);
            return;
        }

        setLoading(true);

        const callbackUrl = new URL("/auth/callback", window.location.origin);
        callbackUrl.searchParams.set("next", nextPath);

        const { error: signUpError } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password,
            options: {
                emailRedirectTo: callbackUrl.toString(),
            },
        });

        setLoading(false);

        if (signUpError) {
            setError(getSafeAuthError(signUpError));
            return;
        }

        setSuccess("Check your email to confirm your account");
    };

    const passwordRuleResults = getPasswordRuleResults(password);

    return (
        <GuestOnly redirectTo={nextPath}>
        <main className="min-h-screen px-5 py-16" style={{ background: "#fcf8ff" }}>
            <section className="mx-auto mt-10 w-full max-w-md rounded-[30px] p-7 sm:p-8"
                style={{
                    background: "rgba(255,255,255,0.9)",
                    border: "1px solid rgba(200,196,214,0.42)",
                    boxShadow: "0 24px 70px -28px rgba(88,69,203,0.35)",
                }}
            >
                <div className="mb-7 text-center">
                    <h1 className="text-3xl font-black" style={{ color: "#1a1930" }}>
                        Create Your Account
                    </h1>
                    <p className="mt-2 text-sm" style={{ color: "#474554" }}>
                        Start tracking your skin progress with TejAi.
                    </p>
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                    <AuthInput
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="Email address"
                        autoComplete="email"
                        required
                    />
                    <AuthInput
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Password"
                        autoComplete="new-password"
                        minLength={12}
                        required
                    />
                    <ul className="grid grid-cols-1 gap-1 px-1 sm:grid-cols-2" aria-label="Password requirements">
                        {passwordRuleResults.map(({ label, passed }) => (
                            <li
                                key={label}
                                className="text-xs font-medium"
                                style={{ color: passed ? "#1a6645" : "#787585" }}
                            >
                                {passed ? "✓" : "○"} {label}
                            </li>
                        ))}
                    </ul>
                    <AuthInput
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Confirm password"
                        autoComplete="new-password"
                        minLength={12}
                        required
                    />

                    {error && (
                        <p className="text-sm font-semibold" style={{ color: "#ba1a1a" }}>
                            {error}
                        </p>
                    )}
                    {success && (
                        <p className="text-sm font-semibold" style={{ color: "#1a6645" }}>
                            {success}
                        </p>
                    )}

                    <AuthButton loading={loading}>Sign Up</AuthButton>
                </form>

                <p className="mt-6 text-center text-sm" style={{ color: "#474554" }}>
                    Already have an account?{" "}
                    <Link href={buildAuthPath("/login", nextPath)} className="font-bold" style={{ color: "#5845cb" }}>
                        Sign in
                    </Link>
                </p>
            </section>
        </main>
        </GuestOnly>
    );
}

export default function SignupPage() {
    return (
        <Suspense fallback={<main className="min-h-screen" style={{ background: "#fcf8ff" }} />}>
            <SignupContent />
        </Suspense>
    );
}
