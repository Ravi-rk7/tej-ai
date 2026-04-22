import AppLayout from "@/components/layout/AppLayout";
import ScanFlow from "@/components/scan/ScanFlow";

export const metadata = {
  title: "Scan My Skin — TejAi",
  description:
    "Upload a front-facing photo and get your AI skin analysis, Glow Score, and personalized routine in under 30 seconds.",
};

/* ─── Step indicator bar ─────────────────────────── */
function StepIndicators() {
  const steps = [
    { num: 1, label: "Upload Photo", active: true },
    { num: 2, label: "AI Analysis", active: false },
    { num: 3, label: "Your Results", active: false },
  ];
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {steps.map(({ num, label, active }, i) => (
        <div key={num} className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0"
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                background: active
                  ? "linear-gradient(135deg, #5845cb, #a88bff)"
                  : "rgba(200,196,214,0.4)",
                color: active ? "#fff" : "#787585",
              }}
            >
              {num}
            </div>
            <span
              className="text-sm font-semibold hidden sm:block"
              style={{
                fontFamily: "'Inter', sans-serif",
                color: active ? "#1a1930" : "#787585",
              }}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className="w-8 h-px hidden sm:block"
              style={{ background: "rgba(200,196,214,0.5)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────── */
export default function ScanPage() {
  return (
    <AppLayout>
      <div
        className="relative flex flex-col items-center justify-center min-h-screen px-4 py-12 md:py-16 overflow-hidden"
        style={{ background: "#fcf8ff" }}
      >
        {/* ── Ambient blobs ── */}
        <div
          className="pointer-events-none absolute -top-48 -right-48 w-162.5 h-162.5 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(168,139,255,0.18) 0%, transparent 70%)",
            filter: "blur(80px)",
            zIndex: 0,
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-48 -left-48 w-137.5 h-137.5 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,215,243,0.25) 0%, transparent 70%)",
            filter: "blur(80px)",
            zIndex: 0,
          }}
        />

        {/* ── Content ── */}
        <div className="relative z-10 w-full" style={{ maxWidth: 520 }}>
          {/* Step indicators */}
          <StepIndicators />

          {/* ── Glassmorphism card ── */}
          <div
            style={{
              background: "rgba(255,255,255,0.88)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderRadius: 32,
              padding: "36px 36px 32px",
              border: "1px solid rgba(200,196,214,0.25)",
              boxShadow:
                "0 4px 6px -1px rgba(0,0,0,0.03), " +
                "0 24px 64px -12px rgba(88,69,203,0.10)",
            }}
          >
            {/* Card header */}
            <div className="flex flex-col gap-3 mb-7">
              {/* Badge */}
              <span
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full w-fit"
                style={{
                  background: "#e4dfff",
                  color: "#5845cb",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "#5845cb",
                    animation: "glow-pulse 2s ease-in-out infinite",
                  }}
                />
                AI Skin Analysis
              </span>

              <h1
                className="text-2xl font-black tracking-tight"
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  color: "#1a1930",
                  lineHeight: 1.2,
                  margin: 0,
                }}
              >
                Upload Your Photo
              </h1>

              <p
                className="text-sm leading-relaxed"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  color: "#474554",
                  margin: 0,
                }}
              >
                Use a clear, bare-faced selfie in natural light for the most
                accurate results. No makeup, no filters.
              </p>

              {/* Tip pills */}
              <div className="flex flex-wrap gap-2 mt-1">
                {["Good lighting ✓", "No filters ✓", "Front-facing ✓"].map(
                  (tip) => (
                    <span
                      key={tip}
                      className="text-xs font-semibold px-3 py-1 rounded-full"
                      style={{
                        background: "rgba(228,223,255,0.55)",
                        color: "#674ab9",
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {tip}
                    </span>
                  )
                )}
              </div>
            </div>

            {/* Divider */}
            <div
              style={{
                height: 1,
                background: "rgba(200,196,214,0.25)",
                marginBottom: 24,
              }}
            />

            {/* Uploader */}
            <ScanFlow />
          </div>

          {/* Privacy note */}
          <div className="flex items-center justify-center gap-2 mt-5">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#787585"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <p
              className="text-xs"
              style={{ fontFamily: "'Inter', sans-serif", color: "#787585" }}
            >
              Your photo is processed securely and never shared with third
              parties.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
