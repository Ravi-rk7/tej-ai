"use client";

import { useEffect, useRef, useState } from "react";

const FEATURES = [
  {
    icon: "🔬",
    badge: "Precision",
    title: "Detect Skin Issues",
    desc: "Our AI scans 42 facial markers — identifying acne, dryness, pigmentation, pores, and more with clinical-grade accuracy.",
    gradient: "from-[#e4dfff] to-[#efebff]",
    accent: "#5845cb",
    delay: "0ms",
  },
  {
    icon: "✨",
    badge: "Personalized",
    title: "Get Your Routine",
    desc: "Receive a simple 3-step skincare routine built specifically for your skin type and concerns. No overwhelming steps.",
    gradient: "from-[#ffd7f3] to-[#fff0fb]",
    accent: "#a01e96",
    delay: "120ms",
  },
  {
    icon: "📈",
    badge: "Progress",
    title: "Track Glow Score",
    desc: "Monitor your skin health over time with our Glow Score™ — a 0–100 metric that shows you exactly where you're improving.",
    gradient: "from-[#e8ddff] to-[#f6f2ff]",
    accent: "#674ab9",
    delay: "240ms",
  },
];

function FeatureCard({ icon, badge, title, desc, gradient, accent, delay, visible }) {
  return (
    <div
      className="relative rounded-[28px] p-8 flex flex-col gap-5 overflow-hidden card-hover"
      style={{
        background: `linear-gradient(135deg, var(--tw-gradient-stops))`,
        backgroundImage: `linear-gradient(135deg, ${gradient.split("from-")[1]?.split(" to-")[0]?.replace("[", "").replace("]", "")}, ${gradient.split("to-")[1]?.replace("[", "").replace("]", "")})`,
        backgroundColor: "#f0eeff",
        border: "1px solid rgba(200,196,214,0.25)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.7s ease ${delay}, transform 0.7s ease ${delay}`,
      }}
    >
      {/* Icon */}
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
        style={{ background: "rgba(255,255,255,0.65)", boxShadow: "0 4px 16px -4px rgba(88,69,203,0.12)" }}
      >
        {icon}
      </div>

      {/* Badge */}
      <span
        className="text-xs font-bold uppercase tracking-widest w-fit px-3 py-1 rounded-full"
        style={{ background: "rgba(255,255,255,0.7)", color: accent, fontFamily: "'Inter', sans-serif" }}
      >
        {badge}
      </span>

      {/* Text */}
      <div className="flex flex-col gap-2">
        <h3
          className="text-xl font-extrabold tracking-tight"
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

      {/* Decorative circle */}
      <div
        className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full opacity-30"
        style={{ background: accent, filter: "blur(24px)" }}
      />
    </div>
  );
}

export default function FeaturesSection() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="features" className="py-28 relative overflow-hidden" style={{ background: "#fcf8ff" }}>
      {/* Subtle top blob */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px]"
        style={{
          background: "radial-gradient(ellipse, rgba(168,139,255,0.1) 0%, transparent 70%)",
          filter: "blur(40px)",
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
            What TejAi Does
          </span>
          <h2
            className="text-4xl md:text-5xl font-black tracking-tight max-w-2xl"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#1a1930" }}
          >
            Precision Analysis,{" "}
            <span className="gradient-text">Tailored for You</span>
          </h2>
          <p
            className="text-lg max-w-xl text-center"
            style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
          >
            Our proprietary AI breaks down your skin&apos;s unique profile and delivers instant, actionable results.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} visible={visible} />
          ))}
        </div>
      </div>
    </section>
  );
}
