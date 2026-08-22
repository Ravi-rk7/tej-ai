"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    tagline: "Try it out",
    features: [
      "1 scan per month",
      "Basic skin type detection",
      "Generic routine suggestions",
    ],
    excluded: ["Glow Score tracking", "Full concern analysis", "AI-personalized routine"],
    cta: "Get Started Free",
    ctaHref: "/scan",
    popular: false,
    highlight: false,
    delay: "0ms",
  },
  {
    name: "Starter",
    price: "$6.99",
    period: "/month",
    tagline: "Most Popular",
    features: [
      "15 scans per month",
      "Full skin concern analysis",
      "AI-personalized 3-step routine",
      "Glow Score and saved scan results",
      "Routine layering guide",
    ],
    excluded: [],
    cta: "Start Starter Plan",
    ctaHref: "/scan",
    popular: true,
    highlight: true,
    delay: "100ms",
  },
  {
    name: "Pro",
    price: "$19.99",
    period: "/month",
    tagline: "Full access",
    features: [
      "50 scans per month",
      "Everything in Starter",
      "Scan history & comparisons",
      "Ingredient conflict checker",
      "Priority support",
    ],
    excluded: [],
    cta: "Start Pro Plan",
    ctaHref: "/scan",
    popular: false,
    highlight: false,
    delay: "200ms",
  },
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
    <section
      id="pricing"
      className="py-28 relative overflow-hidden"
      style={{ background: "#f6f2ff" }}
    >
      {/* BG */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, rgba(124,108,242,0.07) 0%, transparent 65%)",
        }}
      />

      <div className="max-w-7xl mx-auto px-6 lg:px-12 relative z-10" ref={ref}>
        {/* Header */}
        <div
          className="text-center mb-16 flex flex-col items-center gap-4"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(24px)",
            transition: "opacity 0.7s ease, transform 0.7s ease",
          }}
        >
          <span
            className="text-xs font-bold uppercase tracking-[0.2em] px-4 py-2 rounded-full"
            style={{ background: "#e4dfff", color: "#5845cb", fontFamily: "'Inter', sans-serif" }}
          >
            Simple Pricing
          </span>
          <h2
            className="text-4xl md:text-5xl font-black tracking-tight"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#1a1930" }}
          >
            Curated Plans for{" "}
            <span className="gradient-text">Every Skin Journey</span>
          </h2>
          <p
            className="text-lg max-w-xl"
            style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
          >
            Transparent pricing. Cancel anytime. Start free — no credit card needed.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center max-w-5xl mx-auto">
          {PLANS.map(({ name, price, period, tagline, features, excluded, cta, ctaHref, popular, highlight, delay }) => (
            <div
              key={name}
              className="relative flex flex-col rounded-[28px] p-8 transition-all duration-300"
              style={{
                background: highlight ? "white" : "white",
                border: highlight
                  ? "2px solid #5845cb"
                  : "1px solid rgba(200,196,214,0.3)",
                boxShadow: highlight
                  ? "0 0 0 4px rgba(88,69,203,0.08), 0 32px 64px -12px rgba(88,69,203,0.18)"
                  : "0 8px 32px -8px rgba(26,25,48,0.07)",
                transform: highlight ? "scale(1.04)" : "scale(1)",
                opacity: visible ? 1 : 0,
                transformOrigin: "center",
                transition: `opacity 0.7s ease ${delay}, transform 0.35s ease`,
                zIndex: highlight ? 10 : 1,
              }}
              onMouseEnter={e => {
                if (!highlight) {
                  e.currentTarget.style.transform = "scale(1.025) translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 24px 64px -12px rgba(88,69,203,0.14)";
                }
              }}
              onMouseLeave={e => {
                if (!highlight) {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "0 8px 32px -8px rgba(26,25,48,0.07)";
                }
              }}
            >
              {/* Popular badge */}
              {popular && (
                <div
                  className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-white whitespace-nowrap"
                  style={{ background: "linear-gradient(135deg, #5845cb, #a88bff)" }}
                >
                  ✦ Most Popular
                </div>
              )}

              {/* Plan name */}
              <div className="flex flex-col gap-1 mb-6">
                <p
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{ color: popular ? "#5845cb" : "#787585", fontFamily: "'Inter', sans-serif" }}
                >
                  {tagline}
                </p>
                <h3
                  className="text-2xl font-black"
                  style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    color: popular ? "#5845cb" : "#1a1930",
                  }}
                >
                  {name}
                </h3>
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-1 mb-8">
                <span
                  className="text-5xl font-black"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#1a1930" }}
                >
                  {price}
                </span>
                <span className="text-sm" style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}>
                  {period}
                </span>
              </div>

              {/* Features */}
              <ul className="flex flex-col gap-3 mb-8 flex-1">
                {features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2.5 text-sm"
                    style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
                  >
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black mt-0.5"
                      style={{ background: "#e4dfff", color: "#5845cb" }}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
                {excluded.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2.5 text-sm opacity-40"
                    style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
                  >
                    <span className="w-5 h-5 flex items-center justify-center flex-shrink-0 text-base mt-0.5">
                      —
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <Link
                href={ctaHref}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-center transition-all duration-200 block"
                style={
                  highlight
                    ? {
                        background: "linear-gradient(135deg, #5845cb, #a88bff)",
                        color: "white",
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        boxShadow: "0 8px 24px -8px rgba(88,69,203,0.4)",
                      }
                    : {
                        background: "#efebff",
                        color: "#5845cb",
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        border: "1px solid rgba(88,69,203,0.15)",
                      }
                }
              >
                {cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Fine print */}
        <p
          className="text-center text-sm mt-10"
          style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}
        >
          All plans include end-to-end encrypted image processing. Cancel or upgrade anytime.
        </p>
      </div>
    </section>
  );
}
