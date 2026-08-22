"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const AuthContext = createContext(null);

function AuthLoading() {
    return (
        <main
            className="min-h-screen flex items-center justify-center px-5"
            style={{ background: "#fcf8ff" }}
        >
            <div className="text-center" role="status" aria-live="polite">
                <div
                    className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-[#e4dfff] border-t-[#5845cb]"
                    aria-hidden="true"
                />
                <p className="mt-4 text-sm font-semibold" style={{ color: "#474554" }}>
                    Securing your session...
                </p>
            </div>
        </main>
    );
}

export default function AuthProvider({ children }) {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;

        supabase.auth.getSession().then(({ data, error }) => {
            if (!active) return;
            setSession(error ? null : data.session);
            setLoading(false);
        });

        const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            if (!active) return;
            setSession(nextSession);
            setLoading(false);
        });

        return () => {
            active = false;
            listener.subscription.unsubscribe();
        };
    }, []);

    const signOut = useCallback(async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            await supabase.auth.signOut({ scope: "local" });
        }
        setSession(null);
    }, []);

    const value = useMemo(() => ({
        session,
        user: session?.user ?? null,
        loading,
        signOut,
    }), [loading, session, signOut]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return context;
};

export function RequireAuth({ children }) {
    const { loading, session } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !session) {
            const currentPath = typeof window !== "undefined"
                ? `${window.location.pathname}${window.location.search}`
                : pathname;
            const destination = currentPath && pathname !== "/login"
                ? `/login?next=${encodeURIComponent(currentPath)}`
                : "/login";
            router.replace(destination);
        }
    }, [loading, pathname, router, session]);

    if (loading || !session) {
        return <AuthLoading />;
    }

    return children;
}

export function GuestOnly({ children }) {
    const { loading, session } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && session) {
            router.replace("/dashboard");
        }
    }, [loading, router, session]);

    if (loading || session) {
        return <AuthLoading />;
    }

    return children;
}
