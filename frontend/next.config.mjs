const appEnvironment = String(process.env.APP_ENV || "development").toLowerCase();
const isPublicEnvironment = ["staging", "production"].includes(appEnvironment);

const parseOrigin = (name, value) => {
  try {
    const parsed = new URL(value);
    const normalizedInput = value.endsWith("/") ? value.slice(0, -1) : value;
    if (
      parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || parsed.pathname !== "/"
      || normalizedInput !== parsed.origin
      || (isPublicEnvironment && parsed.protocol !== "https:")
    ) {
      throw new Error("non-canonical origin");
    }
    return parsed.origin;
  } catch {
    if (isPublicEnvironment) {
      throw new Error(`${name} must be a canonical HTTPS origin`);
    }
    return null;
  }
};

const apiOrigin = parseOrigin(
  "NEXT_PUBLIC_API_BASE_URL",
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001",
);
const supabaseOrigin = parseOrigin(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321",
);
const supabaseWebSocketOrigin = supabaseOrigin
  ? supabaseOrigin.replace(/^http/, "ws")
  : null;
const isDevelopment = process.env.NODE_ENV !== "production";

export const buildReleaseHeader = (value) => {
  const releaseSha = String(value || "").trim();
  if (!releaseSha) return null;
  if (!/^[a-f0-9]{7,40}$/i.test(releaseSha)) {
    throw new Error(
      "NEXT_PUBLIC_RELEASE_SHA must be a 7 to 40 character Git commit SHA",
    );
  }
  return { key: "X-TejAI-Release", value: releaseSha };
};

const compactPolicy = (directives) => directives
  .map(([name, values]) => [name, values.filter(Boolean).join(" ")].filter(Boolean).join(" "))
  .join("; ");

const contentSecurityPolicy = compactPolicy([
  ["default-src", ["'self'"]],
  ["base-uri", ["'self'"]],
  ["object-src", ["'none'"]],
  ["frame-ancestors", ["'none'"]],
  ["frame-src", ["'none'"]],
  ["form-action", ["'self'"]],
  ["script-src", ["'self'", "'unsafe-inline'", isDevelopment ? "'unsafe-eval'" : null]],
  ["style-src", ["'self'", "'unsafe-inline'"]],
  ["font-src", ["'self'", "data:"]],
  ["img-src", ["'self'", "data:", "blob:"]],
  ["media-src", ["'self'", "blob:"]],
  ["connect-src", [
    "'self'",
    apiOrigin,
    supabaseOrigin,
    supabaseWebSocketOrigin,
    isDevelopment ? "ws:" : null,
  ]],
  ["worker-src", ["'self'", "blob:"]],
  ["manifest-src", ["'self'"]],
  ...appEnvironment === "development" ? [] : [["upgrade-insecure-requests", []]],
]);

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const releaseHeader = buildReleaseHeader(process.env.NEXT_PUBLIC_RELEASE_SHA);
if (releaseHeader) securityHeaders.push(releaseHeader);

if (["staging", "production"].includes(appEnvironment)) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: appEnvironment === "production"
      ? "max-age=31536000"
      : "max-age=300",
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{
      source: "/(.*)",
      headers: securityHeaders,
    }];
  },
};

export default nextConfig;
