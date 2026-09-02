import * as Sentry from "@sentry/browser";

const SAFE_TAGS = new Set(["environment", "release", "errorType"]);

const cleanValue = (value) => String(value || "")
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, ":id")
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
  .replace(/https?:\/\/\S+/gi, "[redacted]")
  .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, "[redacted]")
  .slice(0, 160);

const cleanFilename = (value) => {
  const normalized = String(value || "").split("?")[0].replace(/\\/g, "/");
  return cleanValue(normalized.split("/").filter(Boolean).at(-1) || "unknown");
};

export const sanitizeFrontendEvent = (event = {}) => {
  delete event.user;
  delete event.request;
  delete event.breadcrumbs;
  delete event.extra;
  delete event.contexts;
  delete event.transaction;
  delete event.message;

  event.tags = Object.fromEntries(
    Object.entries(event.tags || {})
      .filter(([key]) => SAFE_TAGS.has(key))
      .map(([key, value]) => [key, cleanValue(value)]),
  );

  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((exception) => ({
      type: cleanValue(exception.type || "Error"),
      value: "Frontend error",
      mechanism: exception.mechanism
        ? { type: cleanValue(exception.mechanism.type || "generic"), handled: true }
        : undefined,
      stacktrace: exception.stacktrace
        ? {
          ...exception.stacktrace,
          frames: (exception.stacktrace.frames || []).map((frame) => ({
            function: cleanValue(frame.function || "anonymous"),
            filename: cleanFilename(frame.filename),
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          })),
        }
        : undefined,
    }));
  }

  return event;
};

let initialized = false;

export const initFrontendObservability = ({
  dsn = process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment = process.env.APP_ENV || "development",
  release = process.env.NEXT_PUBLIC_RELEASE_SHA,
} = {}) => {
  if (initialized || !dsn || typeof window === "undefined") return () => {};

  Sentry.init({
    dsn,
    enabled: ["staging", "production"].includes(environment),
    environment,
    release: release || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    defaultIntegrations: false,
    beforeSend: sanitizeFrontendEvent,
  });
  initialized = true;

  const capture = (value) => {
    const error = value instanceof Error ? value : new Error("Frontend error");
    Sentry.captureException(error, {
      tags: { errorType: cleanValue(error.name || "Error") },
    });
  };
  const onError = (event) => capture(event.error);
  const onUnhandledRejection = (event) => capture(event.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
};
