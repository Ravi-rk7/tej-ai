// Pure presentation contract shared by the API and the backend-independent demo.
// No clients, environment variables, storage or network access belong here.
export const RULE_ROUTINE = Object.freeze({
  schemaVersion: 1,
  source: 'rules',
  morning: [
    { name: 'Gentle cleanser', instructions: 'Cleanse gently with lukewarm water and pat dry.' },
    { name: 'Barrier moisturizer', instructions: 'Apply a fragrance-free moisturizer as directed.' },
    { name: 'Broad-spectrum SPF 30+', instructions: 'Use as the final morning step and reapply as directed on the label.' },
  ],
  night: [
    { name: 'Gentle cleanser', instructions: 'Gently remove sunscreen and cleanse.' },
    { name: 'Barrier moisturizer', instructions: 'Apply a fragrance-free moisturizer as directed.' },
  ],
  safety: {
    patchTest: 'Patch-test new products before using them on your full face.',
    spf: 'Use broad-spectrum SPF 30+ every morning.',
    cautions: 'For irritation, allergies or persistent concerns, speak to a qualified clinician.',
    disclaimer: 'General cosmetic guidance, not a diagnosis or treatment plan.',
    dermatologist: null,
  },
});

export const generateRulesRoutine = () => structuredClone(RULE_ROUTINE);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 140) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
const identifier = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(value) ? value : null;
export const validMetric = metric => record(metric)
  && identifier(metric.key) && text(metric.label)
  && Number.isFinite(metric.value) && Number.isFinite(metric.min) && Number.isFinite(metric.max)
  && metric.min < metric.max && metric.value >= metric.min && metric.value <= metric.max
  && ['higher', 'lower', 'neutral'].includes(metric.direction)
  && text(metric.unit, 40) && identifier(metric.definition);

export const normalizePortfolioResult = (value, { source } = {}) => {
  if (!record(value) || value.schemaVersion !== 2
    || !['live', 'sample'].includes(value.source) || (source && value.source !== source)
    || !text(value.scanId, 100) || !Number.isFinite(Date.parse(value.createdAt))
    || !identifier(value.provider?.name) || !identifier(value.provider?.mappingVersion)
    || !Array.isArray(value.metrics) || value.metrics.length > 30
    || !value.metrics.every(validMetric)
    || new Set(value.metrics.map(metric => metric.key)).size !== value.metrics.length) return null;
  const pickMetric = metric => ({ key: metric.key, label: metric.label, value: metric.value,
    min: metric.min, max: metric.max, unit: metric.unit, direction: metric.direction, definition: metric.definition });
  const observations = (Array.isArray(value.observations) ? value.observations : [])
    .filter(item => record(item) && identifier(item.key) && text(item.label) && text(item.value)
      && ['category', 'observation'].includes(item.kind))
    .slice(0, 20).map(({ key, label, kind, value: detail }) => ({ key, label, kind, value: detail }));
  const cleanSteps = steps => (Array.isArray(steps) ? steps : [])
    .filter(step => text(step?.name) && typeof step.instructions === 'string' && step.instructions.length <= 500)
    .slice(0, 4).map(({ name, instructions }) => ({ name, instructions }));
  return {
    schemaVersion: 2, scanId: value.scanId, createdAt: new Date(value.createdAt).toISOString(), source: value.source,
    provider: { name: value.provider.name, version: text(value.provider.version) || null, mappingVersion: value.provider.mappingVersion },
    skinType: text(value.skinType, 60), overallScore: validMetric(value.overallScore) ? pickMetric(value.overallScore) : null,
    observations, metrics: value.metrics.map(pickMetric),
    routine: value.routine?.source === 'rules' ? { ...generateRulesRoutine(),
      morning: cleanSteps(value.routine.morning), night: cleanSteps(value.routine.night) } : generateRulesRoutine(),
    warnings: ['Lighting and camera conditions can affect observations. Repeat scans are not clinical measurements.'],
  };
};

export const comparisonIdentity = (provider, metric) => JSON.stringify([
  provider.name, provider.version, provider.mappingVersion, metric.key, metric.definition,
  metric.unit, metric.min, metric.max, metric.direction,
]);

// Explicit compatibility boundary. Never apply these scales to a new provider.
export const toPortfolioView = result => {
  if (result?.schemaVersion === 2) return normalizePortfolioResult(result);
  if (!record(result) || !result.scanId || !Number.isFinite(Date.parse(result.createdAt))) return null;
  const provider = result.provider || { name: 'ailabtools', version: 'skin-analysis-pro-v1.7.1', mappingVersion: 'legacy-health-v1' };
  const score = (key, label, value) => ({ key, label, value, min: 0, max: 100, unit: 'points', direction: 'higher', definition: `ailab-${key}-v1` });
  const supportedLegacy = provider.name === 'ailabtools';
  return { schemaVersion: 2, scanId: result.scanId, createdAt: result.createdAt, source: 'live', provider,
    skinType: result.skinType || null,
    overallScore: supportedLegacy && Number.isInteger(result.glowScore) && result.glowScore >= 0 && result.glowScore <= 100 ? score('glow', 'Legacy Glow Score', result.glowScore) : null,
    metrics: supportedLegacy ? Object.entries(result.metrics?.healthScores || {}).filter(([, value]) => Number.isInteger(value) && value >= 0 && value <= 100)
      .map(([key, value]) => score(key, `${key.replaceAll('_', ' ')} · legacy scale`, value)) : [],
    observations: (result.concerns || []).filter(item => typeof item === 'string').map((label, index) => ({ key: `legacy-${index}`, label, kind: 'observation', value: 'Reported in the saved legacy analysis' })),
    routine: result.routine || generateRulesRoutine(), warnings: ['Legacy provider scales. Compare only with the same provider and mapping.'],
  };
};

export const buildPortfolioProgress = (results = []) => {
  const groups = new Map();
  for (const result of [...results].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    for (const metric of [result.overallScore, ...result.metrics].filter(Boolean)) {
      if (!validMetric(metric)) continue;
      const identity = comparisonIdentity(result.provider, metric);
      const group = groups.get(identity) || { ...metric, identity, provider: result.provider, points: [] };
      group.points.push({ scanId: result.scanId, createdAt: result.createdAt, value: metric.value });
      groups.set(identity, group);
    }
  }
  return [...groups.values()].map(group => {
    const latest = group.points.at(-1).value;
    return { ...group, latest,
      previousDelta: group.points.length > 1 ? latest - group.points.at(-2).value : null,
      baselineDelta: group.points.length > 1 ? latest - group.points[0].value : null };
  });
};
