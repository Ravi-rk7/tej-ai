"use client";

import Link from "next/link";
import { LEGAL_CONFIG } from "@/lib/legalConfig";

export default function Footer() {
  return (
    <footer
      className="w-full py-12"
      style={{ background: "#f2efff", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row justify-between items-center gap-6">
        {/* Brand */}
        <div className="flex flex-col items-center md:items-start gap-1">
          <span className="text-lg font-extrabold tracking-tight" style={{ color: "#5845cb" }}>
            TejAi
          </span>
          <span className="text-sm" style={{ color: "#474554" }}>
            © {new Date().getFullYear()} {LEGAL_CONFIG.legalBusinessName || LEGAL_CONFIG.brandName}. All rights reserved.
          </span>
        </div>

        {/* Links */}
        <div className="flex flex-wrap justify-center gap-6">
          {[
            { label: "Privacy Notice", href: "/privacy" },
            { label: "Terms of Service", href: "/terms" },
            { label: "Support", href: "/support" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm transition-colors duration-200"
              style={{ color: "#474554" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#5845cb")}
              onMouseLeave={e => (e.currentTarget.style.color = "#474554")}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
