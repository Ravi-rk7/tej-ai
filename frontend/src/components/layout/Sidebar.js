"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

/* ─── Nav items config ──────────────────────────── */
const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/scan",
    label: "Face Scan",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2H5a2 2 0 00-2 2v3" />
        <path d="M16 2h3a2 2 0 012 2v3" />
        <path d="M8 22H5a2 2 0 01-2-2v-3" />
        <path d="M16 22h3a2 2 0 002-2v-3" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    ),
  },
  {
    href: "/results",
    label: "Skin Results",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="12 8 12 12 14 14" />
        <path d="M3.05 11a9 9 0 1 0 .5-4.5M3 3v5h5" />
      </svg>
    ),
  },
  {
    href: "/community",
    label: "Community",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
];

const FOOTER_ITEMS = [
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 00.34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0015 19.4a1.7 1.7 0 00-1 .6 1.7 1.7 0 00-.4 1.1V21h-4v-.09A1.7 1.7 0 008.6 19.4a1.7 1.7 0 00-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-.6-1 1.7 1.7 0 00-1.1-.4H3v-4h.09A1.7 1.7 0 004.6 8.6a1.7 1.7 0 00-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 009 4.6a1.7 1.7 0 001-.6 1.7 1.7 0 00.4-1.1V3h4v.09A1.7 1.7 0 0015.4 4.6a1.7 1.7 0 001.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0019.4 9c.14.37.36.7.64.98.28.28.62.5.99.62H21v4h-.09a1.7 1.7 0 00-1.51.4z" />
      </svg>
    ),
  },
  {
    href: null,
    label: "Logout",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    ),
  },
];

/* ─── Single Nav Link ───────────────────────────── */
function NavLink({ href, label, icon, active, onClick }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 20px",
        borderRadius: 16,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontWeight: 600,
        fontSize: 14,
        textDecoration: "none",
        transition: "all 0.25s ease",
        ...(active
          ? {
              background: "linear-gradient(135deg, #5845cb 0%, #a88bff 100%)",
              color: "#fff",
              boxShadow: "0 8px 24px -6px rgba(88,69,203,0.35)",
            }
          : {
              color: "#474554",
              background: "transparent",
            }),
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = "#e3dffe";
          e.currentTarget.style.color = "#5845cb";
          e.currentTarget.style.transform = "translateX(4px)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#474554";
          e.currentTarget.style.transform = "translateX(0)";
        }
      }}
      onMouseDown={e => { e.currentTarget.style.transform = "scale(0.98)"; }}
      onMouseUp={e => {
        if (!active) e.currentTarget.style.transform = "translateX(4px)";
        else e.currentTarget.style.transform = "scale(1)";
      }}
    >
      <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

/* ─── Sidebar inner content ─────────────────────── */
function SidebarContent({ pathname, onNavClick, onLogout }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "28px 0",
      }}
    >
      {/* ── Logo / Brand ── */}
      <div style={{ padding: "0 28px 36px" }}>
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            textDecoration: "none",
          }}
          onClick={onNavClick}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              overflow: "hidden",
              flexShrink: 0,
              boxShadow: "0 4px 14px -4px rgba(88,69,203,0.35)",
            }}
          >
            <Image
              src="/logo.png"
              alt="TejAi logo"
              width={44}
              height={44}
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
            />
          </div>
          <div>
            <h1
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 800,
                fontSize: 18,
                color: "#5845cb",
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              TejAi
            </h1>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                color: "#787585",
                margin: 0,
                lineHeight: 1,
                marginTop: 2,
              }}
            >
              Radiant Curator
            </p>
          </div>
        </Link>
      </div>

      {/* ── Main nav links ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "0 16px",
          overflowY: "auto",
        }}
      >
        {NAV_ITEMS.map(({ href, label, icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            icon={icon}
            active={pathname === href || (pathname?.startsWith(href) && href !== "/")}
            onClick={onNavClick}
          />
        ))}
      </div>

      {/* ── Start New Scan CTA ── */}
      <div style={{ padding: "20px 16px 8px" }}>
        <Link
          href="/scan"
          onClick={onNavClick}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "14px 20px",
            borderRadius: 16,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 700,
            fontSize: 14,
            color: "#5845cb",
            background: "#e9e5ff",
            textDecoration: "none",
            transition: "all 0.2s ease",
            border: "none",
            cursor: "pointer",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "#dad7f6";
            e.currentTarget.style.boxShadow = "0 4px 16px -4px rgba(88,69,203,0.2)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "#e9e5ff";
            e.currentTarget.style.boxShadow = "none";
          }}
          onMouseDown={e => { e.currentTarget.style.transform = "scale(0.98)"; }}
          onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          {/* Camera icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Start New Scan
        </Link>
      </div>

      {/* ── Divider ── */}
      <div
        style={{
          height: 1,
          background: "rgba(200,196,214,0.3)",
          margin: "12px 28px",
        }}
      />

      {/* ── Footer links ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: "0 16px",
        }}
      >
        {FOOTER_ITEMS.map(({ href, label, icon }) => {
          const itemStyle = {
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              padding: "11px 20px",
              borderRadius: 14,
              border: "none",
              background: "transparent",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 500,
              fontSize: 13,
              color: "#787585",
              textDecoration: "none",
              transition: "all 0.2s ease",
              cursor: "pointer",
          };
          const onMouseEnter = (event) => {
              const element = event.currentTarget;
              element.style.background = "#e3dffe";
              element.style.color = "#5845cb";
          };
          const onMouseLeave = (event) => {
              const element = event.currentTarget;
              element.style.background = "transparent";
              element.style.color = "#787585";
          };
          const content = (
            <>
              <span style={{ flexShrink: 0 }}>{icon}</span>
              <span>{label}</span>
            </>
          );

          if (!href) {
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  onNavClick();
                  onLogout();
                }}
                style={itemStyle}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={label}
              href={href}
              onClick={onNavClick}
              style={itemStyle}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Mobile Top Bar ────────────────────────────── */
function MobileTopBar({ onOpen, pathname }) {
  const current = NAV_ITEMS.find(n => pathname === n.href) ?? NAV_ITEMS[1];
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        height: 64,
        background: "rgba(252,248,255,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(200,196,214,0.2)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Logo */}
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, overflow: "hidden" }}>
          <Image src="/logo.png" alt="TejAi" width={32} height={32} style={{ objectFit: "cover", width: "100%", height: "100%" }} />
        </div>
        <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 16, color: "#5845cb" }}>
          TejAi
        </span>
      </Link>

      {/* Page title */}
      <span
        style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 600,
          fontSize: 14,
          color: "#474554",
        }}
      >
        {current.label}
      </span>

      {/* Hamburger */}
      <button
        onClick={onOpen}
        aria-label="Open navigation menu"
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          border: "none",
          background: "#e9e5ff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#5845cb",
          flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
    </header>
  );
}

/* ─── Mobile Drawer (slide-in from left) ─────────── */
function MobileDrawer({ open, onClose, pathname, onLogout }) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "rgba(26,25,48,0.45)",
          backdropFilter: "blur(4px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.3s ease",
        }}
      />
      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: 288,
          zIndex: 60,
          background: "#fcf8ff",
          boxShadow: "8px 0 40px -8px rgba(88,69,203,0.15)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.32s cubic-bezier(0.32,0,0.07,1)",
          borderRight: "1px solid rgba(200,196,214,0.2)",
          overflowY: "auto",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close navigation"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: 10,
            border: "none",
            background: "#e9e5ff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#5845cb",
            zIndex: 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <SidebarContent pathname={pathname} onNavClick={onClose} onLogout={onLogout} />
      </div>
    </>
  );
}

/* ─── Main Sidebar export ───────────────────────── */
export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <>
      {/* ── Desktop: fixed sidebar ── */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: 288,
          background: "#fcf8ff",
          borderRight: "1px solid rgba(200,196,214,0.22)",
          zIndex: 40,
          boxShadow: "4px 0 24px -8px rgba(88,69,203,0.06)",
          overflowY: "auto",
        }}
        className="hidden md:block"
      >
        <SidebarContent pathname={pathname} onNavClick={() => {}} onLogout={handleLogout} />
      </aside>

      {/* ── Mobile: sticky top bar + slide-in drawer ── */}
      <div className="md:hidden">
        <MobileTopBar onOpen={() => setMobileOpen(true)} pathname={pathname} />
        <MobileDrawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          pathname={pathname}
          onLogout={handleLogout}
        />
      </div>
    </>
  );
}
