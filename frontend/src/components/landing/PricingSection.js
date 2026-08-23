"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BILLING_PLANS } from "@/lib/billingData";

const SHARED_FEATURES = [
  "Glow Score and cosmetic concern summary",
  "Morning and night wellness routine",
  "Saved results, dashboard, and history",
];

export default function PricingSection() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.12 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="pricing" className="relative overflow-hidden py-28" style={{ background: "#f6f2ff" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, rgba(124,108,242,0.07) 0%, transparent 65%)" }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-12" ref={ref}>
        <div
          className="mb-14 flex flex-col items-center gap-4 text-center"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(24px)",
            transition: "opacity 0.7s ease, transform 0.7s ease",
          }}
        >
          <span
            className="rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.2em]"
            style={{ background: "#e4dfff", color: "#5845cb", fontFamily: "'Inter', sans-serif" }}
          >
            Simple Pricing
          </span>
          <h2
            className="text-4xl font-black tracking-tight md:text-5xl"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#1a1930" }}
          >
            Choose Your <span className="gradient-text">Monthly Scan Allowance</span>
          </h2>
          <p className="max-w-2xl text-lg" style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}>
            Every plan includes the same cosmetic skin insights and safe routine experience. Paid plans increase how many scans you can save each month.
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {BILLING_PLANS.map((plan, index) => {
            const paid = plan.slug !== "free";
            const href = paid ? `/settings?plan=${plan.slug}` : "/scan";
            const label = paid ? `Choose ${plan.name}` : "Start free";

            return (
              <article
                key={plan.slug}
                className="relative flex flex-col rounded-[28px] p-7 transition-all duration-300"
                style={{
                  background: "white",
                  border: paid ? "1px solid rgba(88,69,203,0.28)" : "1px solid rgba(200,196,214,0.45)",
                  boxShadow: paid ? "0 18px 48px -28px rgba(88,69,203,0.35)" : "0 8px 32px -8px rgba(26,25,48,0.07)",
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(18px)",
                  transitionDelay: `${index * 80}ms`,
                }}
              >
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#787585" }}>
                  {plan.scans} scan{plan.scans === 1 ? "" : "s"} per month
                </p>
                <h3 className="mt-2 text-2xl font-black" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {plan.name}
                </h3>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-black" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {plan.price}
                  </span>
                  <span className="text-sm" style={{ color: "#787585" }}>{plan.period}</span>
                </div>
                <p className="mt-4 min-h-16 text-sm leading-6" style={{ color: "#474554" }}>{plan.description}</p>

                <ul className="mt-6 flex flex-1 flex-col gap-3">
                  {SHARED_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm" style={{ color: "#474554" }}>
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-black" style={{ background: "#e4dfff", color: "#5845cb" }} aria-hidden="true">
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={href}
                  className="mt-7 block w-full rounded-2xl py-3.5 text-center text-sm font-bold transition"
                  style={paid
                    ? { background: "linear-gradient(135deg, #5845cb, #8f78ed)", color: "white" }
                    : { background: "#efebff", color: "#5845cb", border: "1px solid rgba(88,69,203,0.15)" }}
                >
                  {label}
                </Link>
              </article>
            );
          })}
        </div>

        <p className="mt-10 text-center text-sm" style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}>
          Prices are shown in USD. The free plan requires an account but no payment card.
        </p>
      </div>
    </section>
  );
}
