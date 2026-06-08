"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 h-20"
      style={{
        background: "rgba(252, 248, 255, 0.8)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(200,196,214,0.18)",
      }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 group">
        <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
          <Image src="/logo.png" alt="TejAi logo" width={36} height={36} className="object-cover w-full h-full" />
        </div>
        <span
          className="text-xl font-extrabold tracking-tight"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#5845cb" }}
        >
          TejAi
        </span>
      </Link>

      {/* Desktop nav links */}
      <div className="hidden md:flex items-center gap-8">
        {[
          { label: "Features", href: "#features" },
          { label: "How It Works", href: "#how-it-works" },
          { label: "Pricing", href: "#pricing" },
        ].map(({ label, href }) => (
          <a
            key={label}
            href={href}
            className="text-sm font-medium transition-colors duration-200"
            style={{
              fontFamily: "'Inter', sans-serif",
              color: "#474554",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#5845cb")}
            onMouseLeave={e => (e.currentTarget.style.color = "#474554")}
          >
            {label}
          </a>
        ))}
      </div>

      {/* CTA */}
      <div className="hidden md:flex items-center gap-3">
        <Link
          href="/login"
          className="px-5 py-2.5 text-sm font-semibold rounded-full transition-all duration-200"
          style={{ color: "#5845cb", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Sign In
        </Link>
        <Link
          href="/scan"
          className="px-6 py-2.5 text-sm font-bold text-white rounded-full transition-all duration-200 glow-button"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Try Free Scan
        </Link>
      </div>

      {/* Mobile hamburger */}
      <button
        className="md:hidden flex flex-col gap-1.5 p-2 rounded-lg"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        <span className={`block w-6 h-0.5 bg-[#1a1930] transition-transform duration-300 ${open ? "translate-y-2 rotate-45" : ""}`} />
        <span className={`block w-6 h-0.5 bg-[#1a1930] transition-opacity duration-300 ${open ? "opacity-0" : ""}`} />
        <span className={`block w-6 h-0.5 bg-[#1a1930] transition-transform duration-300 ${open ? "-translate-y-2 -rotate-45" : ""}`} />
      </button>

      {/* Mobile menu */}
      {open && (
        <div
          className="absolute top-full left-0 right-0 flex flex-col gap-1 p-4 md:hidden"
          style={{
            background: "rgba(252, 248, 255, 0.97)",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(200,196,214,0.25)",
          }}
        >
          {["#features", "#how-it-works", "#pricing"].map((href, i) => (
            <a
              key={i}
              href={href}
              onClick={() => setOpen(false)}
              className="px-4 py-3 text-sm font-medium rounded-xl hover:bg-[#efebff] transition-colors"
              style={{ color: "#474554", fontFamily: "'Inter', sans-serif" }}
            >
              {["Features", "How It Works", "Pricing"][i]}
            </a>
          ))}
          <Link
            href="/scan"
            className="mt-2 py-3 text-center text-sm font-bold text-white rounded-xl glow-button"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Try Free Scan
          </Link>
        </div>
      )}
    </nav>
  );
}
