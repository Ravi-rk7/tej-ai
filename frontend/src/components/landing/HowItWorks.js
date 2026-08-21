"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [
  {
    number: "01",
    icon: "📸",
    title: "Upload Your Face",
    desc: "Take a clear, bare-faced selfie in natural light. Our AI processes it securely in milliseconds — no makeup, no filters.",
    color: "#5845cb",
    bg: "#e4dfff",
    delay: "0ms",
  },
  {
    number: "02",
    icon: "🧬",
    title: "AI Analyzes Your Skin",
    desc: "We review several cosmetic skin signals including hydration, texture, tone, pore appearance, and acne-related markers.",
    color: "#674ab9",
    bg: "#e8ddff",
    delay: "150ms",
  },
  {
    number: "03",
    icon: "🌟",
    title: "Get Your Results",
    desc: "Receive your Glow Score, a list of detected concerns, and a personalized 3-step skincare routine — all in under 30 seconds.",
    color: "#a01e96",
    bg: "#ffd7f3",
    delay: "300ms",
  },
];

export default function HowItWorks() {
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
      id="how-it-works"
      className="py-28 relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #f6f2ff 0%, #fcf8ff 100%)" }}
    >
      {/* BG Blobs */}
      <div
        className="pointer-events-none absolute -left-40 top-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(168,139,255,0.12) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="max-w-7xl mx-auto px-6 lg:px-12 relative z-10" ref={ref}>
        {/* Header */}
        <div
          className="mb-20 flex flex-col gap-4 max-w-2xl"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(24px)",
            transition: "opacity 0.7s ease, transform 0.7s ease",
          }}
        >
          <span
            className="text-xs font-bold uppercase tracking-[0.2em] px-4 py-2 rounded-full w-fit"
            style={{ background: "#e4dfff", color: "#5845cb", fontFamily: "'Inter', sans-serif" }}
          >
            The Method
          </span>
          <h2
            className="text-4xl md:text-5xl font-black tracking-tight"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#1a1930" }}
          >
            Three Steps to{" "}
            <span className="gradient-text">Better Skin</span>
          </h2>
          <p
            className="text-lg"
            style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
          >
            Simple, fast, and designed to support your cosmetic skincare decisions.
          </p>
        </div>

        {/* Steps */}
        <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
          {/* Connector line (desktop) */}
          <div
            className="hidden lg:block absolute top-16 left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-px"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(88,69,203,0.25), transparent)",
              top: "3.5rem",
            }}
          />

          {STEPS.map(({ number, icon, title, desc, color, bg, delay }, idx) => (
            <div
              key={title}
              className="flex flex-col items-start lg:items-center gap-6 relative"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(32px)",
                transition: `opacity 0.7s ease ${delay}, transform 0.7s ease ${delay}`,
              }}
            >
              {/* Step number circle */}
              <div className="relative">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-3xl"
                  style={{ background: bg, border: `2px solid ${color}20` }}
                >
                  {icon}
                </div>
                {/* Number badge */}
                <span
                  className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white"
                  style={{ background: color, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  {idx + 1}
                </span>
              </div>

              {/* Content */}
              <div className="flex flex-col gap-2 text-left lg:text-center">
                <p
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{ color, fontFamily: "'Inter', sans-serif" }}
                >
                  Step {number}
                </p>
                <h3
                  className="text-xl font-extrabold"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#1a1930" }}
                >
                  {title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
                >
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
