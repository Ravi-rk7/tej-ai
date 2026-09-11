import { generateRulesRoutine } from '../../../../shared/portfolio.js';
import { addLocalDays, parseLocalDate } from '../routineData.js';

export const DEMO_STORAGE_KEY = 'tejai.demo.v1';
export const createDemoState = (now = new Date()) => ({ version: 1, today: now.toISOString().slice(0, 10), completed: [] });
export const validateDemoState = value => value?.version === 1 && parseLocalDate(value.today)
  && Array.isArray(value.completed) && value.completed.length <= 2
  && value.completed.every(period => ['morning', 'night'].includes(period))
  && new Set(value.completed).size === value.completed.length
  ? { version: 1, today: value.today, completed: [...value.completed] } : null;
export const loadDemoState = (storage, now = new Date()) => {
  try { return validateDemoState(JSON.parse(storage?.getItem(DEMO_STORAGE_KEY))) || createDemoState(now); }
  catch { return createDemoState(now); }
};
export const saveDemoState = (storage, state) => {
  try { storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
};

// Illustrative legacy scales; these are not a claim about Face++ capabilities.
export const sampleResults = today => Array.from({ length: 8 }, (_, index) => ({
  schemaVersion: 2, scanId: `sample-${index + 1}`,
  createdAt: `${addLocalDays(today, -index * 8)}T09:30:00Z`, source: 'sample',
  provider: { name: 'ailabtools', version: 'skin-analysis-pro-v1.7.1', mappingVersion: 'legacy-health-v1' },
  skinType: 'Combination (sample)', overallScore: null,
  observations: [{ key: 'example', label: 'About this sample', kind: 'observation', value: 'Illustrative legacy readings. No photograph or API was used.' }],
  metrics: [
    { key: 'texture', label: 'Texture · legacy scale', value: [76, 74, 77, 71, 68, 70, 65, 62][index], min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'ailab-texture-v1' },
    { key: 'pores', label: 'Pores · legacy scale', value: [71, 70, 68, 72, 65, 64, 67, 60][index], min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'ailab-pores-v1' },
  ],
  routine: generateRulesRoutine(), warnings: ['Synthetic data for exploring the interface. These readings do not show real treatment outcomes.'],
}));

export const sampleRoutine = state => {
  const { today, completed } = state;
  const startDate = addLocalDays(today, -parseLocalDate(today).getUTCDay() - 52 * 7);
  const trackingStartedOn = addLocalDays(today, -330);
  const days = Array.from({ length: 371 }, (_, index) => {
    const date = addLocalDays(startDate, index);
    const tracked = date >= trackingStartedOn && date <= today;
    const periods = date === today
      ? { morning: completed.includes('morning'), night: completed.includes('night') }
      : { morning: tracked && index % 9 !== 0, night: tracked && index % 5 !== 0 && index % 9 !== 0 };
    const count = Number(periods.morning) + Number(periods.night);
    const status = date > today ? 'future' : date < trackingStartedOn ? 'untracked' : count === 2 ? 'complete' : count === 1 ? 'partial' : 'missed';
    return { date, state: status, level: count * 2, completedCount: count, perfectDay: count === 2, isToday: date === today, periods };
  });
  const tracked = days.filter(day => day.date <= today && day.date >= trackingStartedOn);
  let longest = 0, run = 0;
  for (const day of tracked) { run = day.completedCount ? run + 1 : 0; longest = Math.max(longest, run); }
  const previous = tracked.at(-2);
  let current = 0;
  for (let i = tracked.length - (completed.length ? 1 : 2); i >= 0 && tracked[i].completedCount; i -= 1) current += 1;
  const adherence = count => {
    const window = tracked.slice(-count);
    const done = window.reduce((sum, day) => sum + day.completedCount, 0);
    return { completed: done, possible: window.length * 2, percentage: Math.round(done / (window.length * 2) * 100) };
  };
  return { schemaVersion: 1, generatedAt: `${today}T12:00:00Z`, nextDayAt: `${addLocalDays(today, 1)}T00:00:00Z`,
    preferences: { configured: true, timezone: 'UTC', trackingStartedOn, checkinsResumeAt: null },
    today: { date: today, completedCount: completed.length, scheduledCount: 2,
      periods: Object.fromEntries(['morning', 'night'].map(period => [period, { enabled: true, completed: completed.includes(period), completedAt: completed.includes(period) ? `${today}T10:00:00Z` : null }])) },
    streak: { current, longest, state: completed.length ? 'active' : previous?.completedCount ? 'at_risk' : 'inactive', atRisk: !completed.length && previous?.completedCount > 0, qualifiesToday: completed.length > 0 },
    adherence: { last7Days: adherence(7), last30Days: adherence(30) },
    activity: { weeks: 53, startDate, endDate: days.at(-1).date, weekStartsOn: 'sunday', days },
  };
};
