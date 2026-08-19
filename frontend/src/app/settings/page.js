"use client";

import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";

export default function SettingsPage() {
    const { user } = useAuth();

    return (
        <AppLayout>
            <div className="min-h-screen px-5 py-9 sm:px-8 lg:px-12 lg:py-11">
                <div className="mx-auto w-full max-w-4xl">
                    <header className="mb-8">
                        <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "#787585" }}>Account</p>
                        <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl" style={{ color: "#1a1930" }}>Settings</h1>
                        <p className="mt-2 text-base" style={{ color: "#787585" }}>Manage your identity and account security.</p>
                    </header>

                    <div className="grid gap-5">
                        <section className="rounded-[28px] border bg-white p-6 md:p-7" style={{ borderColor: "rgba(200,196,214,0.45)" }}>
                            <h2 className="text-xl font-black" style={{ color: "#1a1930" }}>Profile</h2>
                            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                                <div>
                                    <dt className="text-xs font-bold uppercase tracking-wider" style={{ color: "#787585" }}>Email</dt>
                                    <dd className="mt-1 break-all font-semibold" style={{ color: "#1a1930" }}>{user?.email}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-bold uppercase tracking-wider" style={{ color: "#787585" }}>Email status</dt>
                                    <dd className="mt-1 font-semibold" style={{ color: user?.email_confirmed_at ? "#1a6645" : "#8a5c00" }}>
                                        {user?.email_confirmed_at ? "Confirmed" : "Confirmation pending"}
                                    </dd>
                                </div>
                            </dl>
                        </section>

                        <section className="rounded-[28px] border bg-white p-6 md:p-7" style={{ borderColor: "rgba(200,196,214,0.45)" }}>
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-black" style={{ color: "#1a1930" }}>Security</h2>
                                    <p className="mt-1 text-sm" style={{ color: "#787585" }}>Update your password through a secure authenticated flow.</p>
                                </div>
                                <Link href="/reset-password" className="rounded-full bg-[#e9e5ff] px-5 py-3 text-sm font-bold text-[#5845cb]">
                                    Change password
                                </Link>
                            </div>
                        </section>

                        <section className="rounded-[28px] border bg-white p-6 md:p-7" style={{ borderColor: "rgba(200,196,214,0.45)" }}>
                            <h2 className="text-xl font-black" style={{ color: "#1a1930" }}>Plan</h2>
                            <p className="mt-2 text-sm" style={{ color: "#787585" }}>Every new account starts with a free entitlement. Billing controls will be expanded in the payments milestone.</p>
                        </section>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
