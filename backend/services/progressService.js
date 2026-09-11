import { createClient } from "@supabase/supabase-js";
import env from "../config/env.js";
import { CONCERN_DEFINITIONS } from "./skinInsightsService.js";
import { serializeScanResult } from './scanResultService.js';
import { toPortfolioView, buildPortfolioProgress } from '../../shared/portfolio.js';

export const PROGRESS_METRICS = Object.freeze([
  { key: "glow", label: "Glow Score" },
  ...CONCERN_DEFINITIONS.map(({ key, label }) => ({ key, label })),
]);
export const PROGRESS_RANGES = Object.freeze({
  "30d": 30,
  "90d": 90,
  "1y": 365,
});
const isScore = (value) =>
  Number.isInteger(value) && value >= 0 && value <= 100;

export const buildScanProgress = ({
  scans = [],
  range = "90d",
  now = new Date(),
} = {}) => {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - PROGRESS_RANGES[range]);
  const ordered = scans
    .filter(
      (scan) =>
        typeof scan?.created_at === "string" &&
        Number.isFinite(Date.parse(scan.created_at)) &&
        new Date(scan.created_at) >= start &&
        new Date(scan.created_at) <= now,
    )
    .sort(
      (a, b) =>
        Date.parse(a.created_at) - Date.parse(b.created_at) ||
        String(a.id).localeCompare(String(b.id)),
    );
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    range,
    metrics: PROGRESS_METRICS.map(({ key, label }) => {
      const points = ordered.flatMap((scan) => {
        const value =
          key === "glow" ? scan.glow_score : scan.metrics?.healthScores?.[key];
        return isScore(value)
          ? [{ createdAt: new Date(scan.created_at).toISOString(), value }]
          : [];
      });
      const latest = points.at(-1)?.value ?? null;
      return {
        key,
        label,
        higherIsBetter: true,
        points,
        latest,
        previousDelta: points.length < 2 ? null : latest - points.at(-2).value,
        baselineDelta: points.length < 2 ? null : latest - points[0].value,
      };
    }),
  };
};

export const createProgressRepository = ({ databaseClient } = {}) => {
  let client = databaseClient;
  return {
    loadScans: async (userId, start, end) => {
      client ||= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const scans = [];
      // Page through the range; Supabase's default row limit must not truncate history.
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client
          .from("skin_analysis")
          .select("id,created_at,glow_score,skin_type,concerns,routine,metrics,provider,provider_version")
          .eq("user_id", userId)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + 499);
        if (error || !Array.isArray(data))
          throw new Error("PROGRESS_UNAVAILABLE");
        scans.push(...data);
        if (data.length < 500) return scans;
      }
    },
  };
};

export const createProgressService = ({
  repository = createProgressRepository(),
  now = () => new Date(),
  portfolio = false,
} = {}) => ({
  summary: async (userId, range) => {
    const current = now();
    const start = new Date(current);
    start.setUTCDate(start.getUTCDate() - PROGRESS_RANGES[range]);
    const scans = await repository.loadScans(
        userId,
        start.toISOString(),
        current.toISOString(),
      );
    if (portfolio) return { schemaVersion: 2, generatedAt: current.toISOString(), range,
      groups: buildPortfolioProgress(scans.map(row => toPortfolioView(serializeScanResult(row))).filter(Boolean)) };
    return buildScanProgress({
      scans,
      range,
      now: current,
    });
  },
});
