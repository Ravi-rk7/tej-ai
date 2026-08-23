"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function CtaSection() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-28 relative overflow-hidden" style={{ background: "#fcf8ff" }}>
      {/* BG blobs */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 60% 50%, rgba(168,139,255,0.12) 0%, transparent 60%), " +
            "radial-gradient(ellipse at 40% 50%, rgba(124,108,242,0.09) 0%, transparent 60%)",
        }}
      />

      <div
        className="max-w-3xl mx-auto px-6 text-center flex flex-col items-center gap-8 relative z-10"
        ref={ref}
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(32px)",
          transition: "opacity 0.8s ease, transform 0.8s ease",
        }}
      >
        {/* Badge */}
        <span
          className="text-xs font-bold uppercase tracking-[0.2em] px-4 py-2 rounded-full"
          style={{ background: "#e4dfff", color: "#5845cb", fontFamily: "'Inter', sans-serif" }}
        >
          Ready to glow?
        </span>

        {/* Headline */}
        <h2
          className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1]"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#1a1930" }}
        >
          Start Your Skin Journey{" "}
          <span className="gradient-text">Skin Today</span>
        </h2>

        <p
          className="text-lg max-w-xl"
          style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
        >
          Create a free account to save your cosmetic skin insights and personalized wellness routine. The free plan does not require a payment card.
        </p>

        {/* CTA Button — with recurring glow pulse */}
        <Link
          href="/scan"
          id="bottom-cta"
          className="px-10 py-5 rounded-2xl text-white font-black text-lg transition-all duration-200 glow-button"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Start Free Scan →
        </Link>

        {/* Trust row */}
        <div
          className="flex flex-wrap items-center justify-center gap-6 text-sm"
          style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}
        >
          {[
            { icon: "🔒", text: "Private & Secure" },
            { icon: "⚡", text: "Clear Results" },
            { icon: "✅", text: "Free Account Plan" },
          ].map(({ icon, text }) => (
            <span key={text} className="flex items-center gap-2">
              <span>{icon}</span>
              <span>{text}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
