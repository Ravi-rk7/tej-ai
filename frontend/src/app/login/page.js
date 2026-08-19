"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GuestOnly } from "@/components/auth/AuthProvider";
import { loginWithPassword } from "@/lib/api";

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
            {loading ? "Signing in..." : children}
        </button>
    );
}

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [passwordUpdated] = useState(() => {
        if (typeof window === "undefined") return false;
        return new URLSearchParams(window.location.search).get("password") === "updated";
    });

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        setLoading(true);

        try {
            await loginWithPassword({ email: email.trim(), password });
            const requestedPath = new URLSearchParams(window.location.search).get("next");
            const destination = requestedPath?.startsWith("/")
                && !requestedPath.startsWith("//")
                ? requestedPath
                : "/dashboard";
            router.replace(destination);
        } catch (signInError) {
            setError(
                signInError?.message || "We could not sign you in. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <GuestOnly>
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
                        Welcome Back
                    </h1>
                    <p className="mt-2 text-sm" style={{ color: "#474554" }}>
                        Sign in to view your Glow Score and scan history.
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
                        autoComplete="current-password"
                        required
                    />

                    <div className="text-right">
                        <Link
                            href="/forgot-password"
                            className="text-sm font-bold"
                            style={{ color: "#5845cb" }}
                        >
                            Forgot password?
                        </Link>
                    </div>

                    {passwordUpdated && !error && (
                        <p className="text-sm font-semibold" style={{ color: "#1a6645" }}>
                            Password updated. Sign in with your new password.
                        </p>
                    )}

                    {error && (
                        <p className="text-sm font-semibold" style={{ color: "#ba1a1a" }}>
                            {error}
                        </p>
                    )}

                    <AuthButton loading={loading}>Sign In</AuthButton>
                </form>

                <p className="mt-6 text-center text-sm" style={{ color: "#474554" }}>
                    Don&apos;t have an account?{" "}
                    <Link href="/signup" className="font-bold" style={{ color: "#5845cb" }}>
                        Sign up
                    </Link>
                </p>
            </section>
        </main>
        </GuestOnly>
    );
}
