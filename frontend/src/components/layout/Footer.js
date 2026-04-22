"use client";

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
            © 2024 TejAi Skincare. All rights reserved.
          </span>
        </div>

        {/* Links */}
        <div className="flex flex-wrap justify-center gap-6">
          {["Privacy Policy", "Terms of Service", "Scientific Method", "Contact"].map((link) => (
            <a
              key={link}
              href="#"
              className="text-sm transition-colors duration-200"
              style={{ color: "#474554" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#5845cb")}
              onMouseLeave={e => (e.currentTarget.style.color = "#474554")}
            >
              {link}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
