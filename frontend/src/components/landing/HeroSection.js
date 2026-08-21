"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function HeroSection() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Trigger fade-in animation on mount
    const t = setTimeout(() => setLoaded(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      className="relative min-h-screen flex items-center pt-20 pb-16 overflow-hidden"
      style={{ background: "#fcf8ff" }}
    >
      {/* ── Ambient background blobs ── */}
      <div
        className="pointer-events-none absolute -top-40 -right-40 w-[700px] h-[700px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(168,139,255,0.22) 0%, transparent 70%)",
          filter: "blur(60px)",
          zIndex: 0,
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(255,215,243,0.35) 0%, transparent 70%)",
          filter: "blur(60px)",
          zIndex: 0,
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* ── LEFT: Copy ── */}
          <div
            className="flex flex-col gap-7 max-w-xl"
            style={{
              opacity: loaded ? 1 : 0,
              transform: loaded ? "translateY(0)" : "translateY(24px)",
              transition: "opacity 0.8s ease, transform 0.8s ease",
            }}
          >
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full w-fit text-sm font-semibold"
              style={{
                background: "#e4dfff",
                color: "#5845cb",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <span className="w-2 h-2 rounded-full bg-[#5845cb] animate-pulse" />
              AI Skincare • Cosmetic wellness analysis
            </div>

            {/* Headline */}
            <h1
              className="text-[2.75rem] md:text-[3.5rem] lg:text-[4rem] font-black leading-[1.08] tracking-tight"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#1a1930" }}
            >
              Know What&apos;s Wrong{" "}
              <br className="hidden md:block" />
              With Your Skin —
              <br />
              <span className="gradient-text">In 60 Seconds</span>
            </h1>

            {/* Subtext */}
            <p
              className="text-lg leading-relaxed"
              style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
            >
              Scan your face, detect skin issues, and get a routine that{" "}
              <span className="font-semibold" style={{ color: "#1a1930" }}>actually works</span>.
              Powered by AI-assisted cosmetic insights.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link
                href="/scan"
                id="hero-cta-primary"
                className="glow-button px-8 py-4 rounded-2xl text-white font-bold text-base text-center transition-all duration-200"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Scan My Skin Free →
              </Link>
              <a
                href="#how-it-works"
                className="px-8 py-4 rounded-2xl text-sm font-semibold text-center transition-all duration-200 flex items-center justify-center gap-2"
                style={{
                  background: "#efebff",
                  color: "#5845cb",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                See How It Works
              </a>
            </div>

            {/* Trust text */}
            <p
              className="text-sm flex items-center gap-2"
              style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}
            >
              <span className="text-base">🔒</span>
              Takes 30 seconds • No signup required • Your photo is private
            </p>

            {/* Social proof */}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex -space-x-2">
                {["bg-purple-300", "bg-pink-300", "bg-indigo-300", "bg-violet-400"].map((c, i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full border-2 border-white ${c} flex items-center justify-center text-xs font-bold text-white`}
                  >
                    {["A", "M", "S", "K"][i]}
                  </div>
                ))}
              </div>
              <p className="text-sm" style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}>
                <span className="font-bold" style={{ color: "#1a1930" }}>2,400+</span> scans completed today
              </p>
            </div>
          </div>

          {/* ── RIGHT: Hero visual ── */}
          <div
            className="relative flex items-center justify-center"
            style={{
              opacity: loaded ? 1 : 0,
              transition: "opacity 1s ease 0.25s",
            }}
          >
            {/* Floating image wrapper */}
            <div
              className="relative w-full max-w-[440px] aspect-[3/4] rounded-[40px] overflow-hidden"
              style={{
                animation: "float 6s ease-in-out infinite",
                boxShadow: "0 40px 80px -16px rgba(88, 69, 203, 0.22)",
              }}
            >
              {/* Hero image */}
              <Image
                src="/girl_heroImg.jpg"
                alt="Woman with healthy glowing skin — TejAi AI scan preview"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover object-center"
                priority
              />

              {/* Scan-line overlay */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Corner brackets */}
                {[
                  "top-6 left-6 border-t-4 border-l-4 rounded-tl-xl",
                  "top-6 right-6 border-t-4 border-r-4 rounded-tr-xl",
                  "bottom-6 left-6 border-b-4 border-l-4 rounded-bl-xl",
                  "bottom-6 right-6 border-b-4 border-r-4 rounded-br-xl",
                ].map((cls, i) => (
                  <div
                    key={i}
                    className={`absolute w-7 h-7 ${cls}`}
                    style={{ borderColor: "rgba(124,108,242,0.8)" }}
                  />
                ))}

                {/* Scanning line */}
                <div
                  className="absolute left-6 right-6 h-0.5 opacity-60"
                  style={{
                    background: "linear-gradient(90deg, transparent, #7C6CF2, transparent)",
                    animation: "scan-line 2.5s linear infinite",
                    top: 0,
                  }}
                />
              </div>

              {/* Bottom gradient */}
              <div
                className="absolute bottom-0 left-0 right-0 h-36"
                style={{
                  background: "linear-gradient(to top, rgba(88,69,203,0.45), transparent)",
                }}
              />
            </div>

            {/* ── Floating Glow Score badge ── */}
            <div
              className="absolute -bottom-4 left-0 glass-panel rounded-2xl p-4 flex items-center gap-3 w-[220px]"
              style={{
                animation: "float 6s ease-in-out 1s infinite, glow-pulse 3s ease-in-out infinite",
                boxShadow: "0 16px 40px -8px rgba(88, 69, 203, 0.2)",
              }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-black text-xl text-white flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #5845cb, #a88bff)" }}
              >
                78
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#5845cb", fontFamily: "'Inter', sans-serif" }}>
                  Glow Score
                </p>
                <p className="text-sm font-semibold flex items-center gap-1" style={{ color: "#1a1930", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  <span className="text-emerald-500">↑</span> Improving
                </p>
              </div>
            </div>

            {/* ── Concern pills ── */}
            <div
              className="absolute -top-4 right-0 flex flex-col gap-2"
              style={{
                animation: "float 6s ease-in-out 2s infinite",
              }}
            >
              {[
                { label: "Mild Acne", color: "#ba1a1a", bg: "#ffdad6" },
                { label: "Uneven Tone", color: "#a01e96", bg: "#ffd7f3" },
              ].map(({ label, color, bg }) => (
                <div
                  key={label}
                  className="px-4 py-2 rounded-full text-xs font-bold glass-panel"
                  style={{ color, background: bg, fontFamily: "'Inter', sans-serif" }}
                >
                  ● {label}
                </div>
              ))}
            </div>

            {/* ── AI Insight floating card ── */}
            <div
              className="absolute top-1/2 -left-8 glass-panel rounded-2xl p-3 flex items-center gap-2.5 w-[180px] hidden lg:flex"
              style={{
                animation: "float 6s ease-in-out 3s infinite",
              }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm"
                style={{ background: "#e4dfff" }}
              >
                🧬
              </div>
              <div>
                <p className="text-[11px] font-bold" style={{ color: "#5845cb", fontFamily: "'Inter', sans-serif" }}>AI Detected</p>
                <p className="text-[11px] font-medium" style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}>Combo Skin</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
