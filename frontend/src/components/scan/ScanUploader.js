"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { scanSkinFile, isLimitError, isUnauthorizedError } from "@/lib/api";
import { isValidScanId, resultPathFor } from "@/lib/resultState";
import {
  inspectScanDimensions,
  validateScanFile,
} from "@/lib/scanFileValidation";

/* ─── States ─────────────────────────────────────── */
const STATE = {
  EMPTY: "empty",
  HOVER: "hover",
  PREVIEW: "preview",
  SCANNING: "scanning",
  DONE: "done",
  ERROR: "error",
};

/* ─── Scanning Line (overlay on preview) ─────────── */
function ScanLine() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ borderRadius: "inherit" }}
    >
      {/* Moving gradient line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: "3px",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(124,108,242,0.9) 30%, rgba(168,139,255,1) 50%, rgba(124,108,242,0.9) 70%, transparent 100%)",
          animation: "scan-line 2s linear infinite",
          top: 0,
          boxShadow: "0 0 12px 4px rgba(124,108,242,0.45)",
          zIndex: 10,
        }}
      />
      {/* Subtle horizontal sweep tint */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(88,69,203,0.04) 0%, transparent 40%, transparent 60%, rgba(88,69,203,0.04) 100%)",
          zIndex: 9,
        }}
      />
      {/* Corner bracket — top-left */}
      <div style={{ position: "absolute", top: 16, left: 16, width: 28, height: 28, borderTop: "3px solid rgba(124,108,242,0.9)", borderLeft: "3px solid rgba(124,108,242,0.9)", borderRadius: "6px 0 0 0", zIndex: 11 }} />
      {/* Corner bracket — top-right */}
      <div style={{ position: "absolute", top: 16, right: 16, width: 28, height: 28, borderTop: "3px solid rgba(124,108,242,0.9)", borderRight: "3px solid rgba(124,108,242,0.9)", borderRadius: "0 6px 0 0", zIndex: 11 }} />
      {/* Corner bracket — bottom-left */}
      <div style={{ position: "absolute", bottom: 16, left: 16, width: 28, height: 28, borderBottom: "3px solid rgba(124,108,242,0.9)", borderLeft: "3px solid rgba(124,108,242,0.9)", borderRadius: "0 0 0 6px", zIndex: 11 }} />
      {/* Corner bracket — bottom-right */}
      <div style={{ position: "absolute", bottom: 16, right: 16, width: 28, height: 28, borderBottom: "3px solid rgba(124,108,242,0.9)", borderRight: "3px solid rgba(124,108,242,0.9)", borderRadius: "0 0 6px 0", zIndex: 11 }} />
    </div>
  );
}

/* ─── Upload drop-zone ───────────────────────────── */
function DropZone({ state, onFile, onDragEnter, onDragLeave, onDrop, fileInputRef }) {
  const isEmpty = state === STATE.EMPTY;
  const isHover = state === STATE.HOVER;

  return (
    <div
      className="relative flex flex-col items-center justify-center gap-5 cursor-pointer select-none transition-all duration-300"
      style={{
        minHeight: 280,
        borderRadius: 24,
        border: isHover
          ? "2px solid #7C6CF2"
          : "2px dashed rgba(124,108,242,0.35)",
        background: isHover
          ? "rgba(124,108,242,0.06)"
          : "rgba(248,246,255,0.7)",
        boxShadow: isHover
          ? "0 0 0 6px rgba(124,108,242,0.1), inset 0 0 32px rgba(124,108,242,0.05)"
          : "none",
        transform: isHover ? "scale(1.01)" : "scale(1)",
        transition: "all 0.25s ease",
      }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,.jpg,.jpeg"
        className="absolute inset-0 opacity-0 cursor-pointer"
        style={{ zIndex: 5 }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />

      {/* Upload icon */}
      <div
        className="transition-transform duration-300"
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: isHover
            ? "linear-gradient(135deg, #5845cb, #a88bff)"
            : "rgba(228,223,255,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: isHover ? "scale(1.1) translateY(-4px)" : "scale(1)",
          boxShadow: isHover ? "0 16px 32px -8px rgba(88,69,203,0.35)" : "none",
          transition: "all 0.3s ease",
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isHover ? "#fff" : "#5845cb"}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>

      {/* Text */}
      <div className="flex flex-col items-center gap-1.5 z-10">
        <p
          className="text-base font-bold transition-colors duration-200"
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            color: isHover ? "#5845cb" : "#1a1930",
          }}
        >
          {isHover ? "Drop your photo here" : "Upload a clear front-facing photo"}
        </p>
        <p
          className="text-sm"
          style={{ fontFamily: "'Inter', sans-serif", color: "#787585" }}
        >
          {isHover ? "Release to upload" : "Drag & drop or click to browse"}
        </p>
      </div>

      {/* Format badge */}
      <div
        className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest z-10"
        style={{
          background: "rgba(255,255,255,0.7)",
          color: "#787585",
          fontFamily: "'Inter', sans-serif",
          border: "1px solid rgba(200,196,214,0.4)",
        }}
      >
        JPG · JPEG — max 8 MB
      </div>
    </div>
  );
}

/* ─── Image Preview Panel ────────────────────────── */
function PreviewPanel({ src, state, onRemove }) {
  const isScanning = state === STATE.SCANNING;
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div
      className="relative overflow-hidden"
      style={{
        borderRadius: 24,
        minHeight: 320,
        background: "#1a1930",
        opacity: imgLoaded ? 1 : 0,
        transform: imgLoaded ? "scale(1)" : "scale(0.97)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}
    >
      {/* The image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Uploaded face for skin analysis"
        className="w-full h-full object-cover"
        style={{ minHeight: 320, maxHeight: 420, display: "block" }}
        onLoad={() => setImgLoaded(true)}
      />

      {/* Scan overlay — only when scanning */}
      {isScanning && <ScanLine />}

      {/* Overlay gradient */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "50%",
          background: "linear-gradient(to top, rgba(26,25,48,0.85) 0%, transparent 100%)",
          zIndex: 8,
        }}
      />

      {/* Bottom info bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "20px 24px",
          zIndex: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {isScanning ? (
          <div className="flex items-center gap-3">
            {/* Spinner */}
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "2.5px solid rgba(255,255,255,0.25)",
                borderTopColor: "#a88bff",
                animation: "spin 0.9s linear infinite",
              }}
            />
            <span
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 700,
                fontSize: 14,
                color: "#fff",
                letterSpacing: "0.02em",
              }}
            >
              Analyzing skin markers...
            </span>
          </div>
        ) : (
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            Photo uploaded ✓
          </span>
        )}

        {/* Remove button — only when not scanning */}
        {!isScanning && (
          <button
            onClick={onRemove}
            style={{
              background: "rgba(255,255,255,0.15)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 10,
              padding: "6px 14px",
              color: "#fff",
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.2s ease",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.25)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Error Banner ───────────────────────────────── */
function ErrorBanner({ message, onDismiss }) {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl px-4 py-3.5"
      style={{
        background: "#fff0f0",
        border: "1px solid rgba(186,26,26,0.25)",
        animation: "fade-in 0.3s ease-out forwards",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ba1a1a"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, marginTop: 1 }}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p
        className="text-sm flex-1"
        style={{ fontFamily: "'Inter', sans-serif", color: "#ba1a1a", fontWeight: 600 }}
      >
        {message}
      </p>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#ba1a1a",
          opacity: 0.6,
          padding: 0,
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label="Dismiss error"
      >
        ✕
      </button>
    </div>
  );
}

/* ─── Scan Button ────────────────────────────────── */
function ScanButton({ state, onClick }) {
  const disabled =
    state === STATE.EMPTY ||
    state === STATE.HOVER ||
    state === STATE.SCANNING ||
    state === STATE.DONE;
  const isScanning = state === STATE.SCANNING;
  const isRetry = state === STATE.ERROR;

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "100%",
        padding: "18px 32px",
        borderRadius: 18,
        border: "none",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontWeight: 800,
        fontSize: 17,
        cursor: disabled ? "not-allowed" : "pointer",
        color: "#fff",
        background: disabled
          ? "rgba(200,196,214,0.6)"
          : "linear-gradient(135deg, #5845cb 0%, #7C6CF2 50%, #a88bff 100%)",
        boxShadow: disabled ? "none" : "0 12px 40px -8px rgba(88,69,203,0.45)",
        opacity: disabled ? 0.6 : 1,
        transform: "scale(1)",
        transition: "all 0.2s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        animation: disabled ? "none" : "btn-glow 3s ease-in-out infinite",
        outline: "none",
      }}
      onMouseEnter={e => {
        if (!disabled) {
          e.currentTarget.style.transform = "translateY(-2px) scale(1.01)";
          e.currentTarget.style.boxShadow = "0 20px 50px -8px rgba(88,69,203,0.55)";
        }
      }}
      onMouseLeave={e => {
        if (!disabled) {
          e.currentTarget.style.transform = "translateY(0) scale(1)";
          e.currentTarget.style.boxShadow = "0 12px 40px -8px rgba(88,69,203,0.45)";
        }
      }}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={e => { if (!disabled) e.currentTarget.style.transform = "translateY(-2px) scale(1.01)"; }}
    >
      {isScanning ? (
        <>
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              border: "2.5px solid rgba(255,255,255,0.35)",
              borderTopColor: "#fff",
              display: "inline-block",
              animation: "spin 0.85s linear infinite",
              flexShrink: 0,
            }}
          />
          Analyzing your skin...
        </>
      ) : (
        <>
          {isRetry ? "Try scan again" : "Start AI Scan"}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </>
      )}
    </button>
  );
}

/* ─── Trust row ──────────────────────────────────── */
function TrustRow() {
  const items = [
    { icon: "⚡", text: "Processing time varies" },
    { icon: "🔒", text: "Not stored by TejAi" },
    { icon: "✅", text: "Sign in to save results" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      {items.map(({ icon, text }) => (
        <span
          key={text}
          className="flex items-center gap-1.5 text-sm"
          style={{ color: "#787585", fontFamily: "'Inter', sans-serif" }}
        >
          <span>{icon}</span>
          <span>{text}</span>
        </span>
      ))}
    </div>
  );
}

/* ─── Main component ─────────────────────────────── */
function FaceGuidanceBanner() {
  return (
    <p
      className="rounded-2xl px-4 py-3.5 text-sm font-semibold leading-6"
      style={{
        background: "rgba(255,240,212,0.75)",
        border: "1px solid rgba(138,92,0,0.20)",
        color: "#7a5200",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      For best results: use a well-lit, front-facing photo where your face fills
      most of the frame. Minimum face width: 400px.
    </p>
  );
}

export default function ScanUploader({ onScanComplete, onLimitReached }) {
  const router = useRouter();
  const [state, setState] = useState(STATE.EMPTY);
  const [imageSrc, setImageSrc] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [dragDepth, setDragDepth] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [uploadGuidance, setUploadGuidance] = useState(null);
  const fileInputRef = useRef(null);
  const previewUrlRef = useRef(null);

  const clearPreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => clearPreviewUrl, [clearPreviewUrl]);

  /* Track drag depth to avoid flicker when hovering child elements */
  const handleDragEnter = useCallback(e => {
    e.preventDefault();
    setDragDepth(d => d + 1);
    setState(STATE.HOVER);
  }, []);

  const handleDragLeave = useCallback(e => {
    e.preventDefault();
    setDragDepth(d => {
      const next = d - 1;
      if (next <= 0) setState(STATE.EMPTY);
      return Math.max(0, next);
    });
  }, []);

  const processFile = useCallback(async file => {
    const validationError = validateScanFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setUploadGuidance(null);
      setState(STATE.EMPTY);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setErrorMessage(null);
    setUploadGuidance(null);

    try {
      const dimensions = await inspectScanDimensions(file);
      clearPreviewUrl();
      const previewUrl = URL.createObjectURL(file);
      previewUrlRef.current = previewUrl;
      setImageFile(file);
      setImageSrc(previewUrl);
      setState(STATE.PREVIEW);
      setDragDepth(0);
      if (dimensions.meetsRecommendation === false) {
        setUploadGuidance(
          "This photo is accepted, but a face at least 400px wide will give better results.",
        );
      }
    } catch (error) {
      setImageFile(null);
      setImageSrc(null);
      setState(STATE.EMPTY);
      setErrorMessage(error?.message || "This JPG could not be read.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [clearPreviewUrl]);

  const handleDrop = useCallback(e => {
    e.preventDefault();
    setDragDepth(0);
    const file = e.dataTransfer.files?.[0];
    processFile(file);
  }, [processFile]);

  const handleRemove = useCallback(() => {
    clearPreviewUrl();
    setImageSrc(null);
    setImageFile(null);
    setErrorMessage(null);
    setUploadGuidance(null);
    setState(STATE.EMPTY);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [clearPreviewUrl]);

  const handleScan = useCallback(async () => {
    if (![STATE.PREVIEW, STATE.ERROR].includes(state) || !imageFile) return;

    setState(STATE.SCANNING);
    setErrorMessage(null);

    try {
      const data = await scanSkinFile(imageFile);

      if (!isValidScanId(data?.scanId)) {
        throw new Error("The scan completed without a valid result ID. Please try again.");
      }

      setState(STATE.DONE);

      if (typeof onScanComplete === "function") {
        onScanComplete(data);
      }

      router.push(resultPathFor(data.scanId));
    } catch (err) {
      // 403 with "scan limit reached" → trigger paywall
      if (isLimitError(err)) {
        setState(STATE.PREVIEW);
        if (typeof onLimitReached === "function") {
          onLimitReached();
        }
        return;
      }

      if (isUnauthorizedError(err)) {
        router.push("/login");
        return;
      }

      // All other errors → show inline banner and reset to preview state
      setState(STATE.ERROR);
      setErrorMessage(
        err?.message || "Something went wrong. Please try again."
      );
    }
  }, [state, imageFile, onScanComplete, onLimitReached, router]);

  const hasImage =
    state === STATE.PREVIEW ||
    state === STATE.SCANNING ||
    state === STATE.DONE ||
    state === STATE.ERROR;

  // Treat ERROR state as PREVIEW for button/panel rendering
  const displayState = state === STATE.ERROR ? STATE.PREVIEW : state;

  return (
    <div className="flex flex-col gap-5">
      <FaceGuidanceBanner />
      {/* Drop zone — show only when no image */}
      {!hasImage && (
        <DropZone
          state={displayState}
          onFile={processFile}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          fileInputRef={fileInputRef}
        />
      )}

      {/* Image preview — show when image uploaded */}
      {hasImage && imageSrc && (
        <PreviewPanel
          src={imageSrc}
          state={displayState}
          onRemove={handleRemove}
        />
      )}

      {/* Inline error banner */}
      {errorMessage && (
        <ErrorBanner
          message={errorMessage}
          onDismiss={() => setErrorMessage(null)}
        />
      )}

      {uploadGuidance && (
        <p
          role="status"
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: "rgba(255,240,212,0.75)",
            border: "1px solid rgba(138,92,0,0.20)",
            color: "#7a5200",
          }}
        >
          {uploadGuidance}
        </p>
      )}

      {/* CTA Button */}
      <ScanButton state={state} onClick={handleScan} />

      {/* Trust row */}
      <TrustRow />
    </div>
  );
}

