import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarDays,
  dayOrdinal,
  parseCalendarDate,
  validateTimezone,
} from '../services/routineService.js';
import { generateRulesRoutine } from '../../shared/portfolio.js';
import {
  buildHeatmap,
  calculateAdherence,
  calculateLongestStreak,
  calculateStreak,
} from '../services/routineService.js';
import { encodeHistoryCursor, decodeHistoryCursor, parseHistoryQuery } from '../services/historyService.js';
import { buildQualityWarnings, normalizeStoredRoutine, serializeScanResult } from '../services/scanResultService.js';
import { buildPortfolioProgress, normalizePortfolioResult, validMetric } from '../../shared/portfolio.js';

test('calendar parsing accepts a normal ISO date', () => {
  assert.deepEqual(parseCalendarDate('2026-05-25'), { year: 2026, month: 5, day: 25 });
});

test('calendar arithmetic crosses a month boundary', () => {
  assert.equal(addCalendarDays('2026-05-31', 1), '2026-06-01');
  assert.equal(dayOrdinal('1970-01-01'), 0);
});

test('routine timezone validation accepts UTC', () => {
  assert.equal(validateTimezone('UTC'), true);
  assert.equal(validateTimezone('not/a/timezone'), false);
});

test('rules routine generation returns an independent copy', () => {
  const routine = generateRulesRoutine();
  routine.morning.pop();
  assert.equal(generateRulesRoutine().morning.length, 3);
});
test('calendar parsing rejects impossible dates', () => {
  assert.equal(parseCalendarDate('2026-02-29'), null);
  assert.equal(parseCalendarDate('2026-04-31'), null);
  assert.equal(parseCalendarDate('2026-00-10'), null);
});
test('accepts month-end calendar dates 001', () => {
  assert.deepEqual(parseCalendarDate('2026-01-31'), { year: 2026, month: 1, day: 31 });
  assert.deepEqual(parseCalendarDate('2026-06-30'), { year: 2026, month: 6, day: 30 });
});
test('handles leap-day rules 002', () => {
  assert.equal(parseCalendarDate('2024-02-29').day, 29);
  assert.equal(parseCalendarDate('2023-02-29'), null);
});
test('rejects malformed dates 003', () => {
  assert.equal(parseCalendarDate('2026-2-05'), null);
  assert.equal(parseCalendarDate('not-a-date'), null);
});
test('crosses a month boundary 004', () => {
  assert.equal(addCalendarDays('2026-05-31', 1), '2026-06-01');
  assert.equal(addCalendarDays('2026-06-01', -1), '2026-05-31');
});
test('keeps the Unix epoch ordinal 005', () => {
  assert.equal(dayOrdinal('1970-01-01'), 0);
  assert.equal(dayOrdinal('1970-01-02'), 1);
});
test('accepts an IANA timezone 006', () => {
  assert.equal(validateTimezone('Europe/London'), true);
  assert.equal(validateTimezone('America/New_York'), true);
});
test('rejects an unsafe timezone 007', () => {
  assert.equal(validateTimezone('posix/UTC'), false);
  assert.equal(validateTimezone('not/a/zone'), false);
});
test('handles an empty streak 008', () => {
  assert.equal(calculateLongestStreak([], '2026-05-25'), 0);
  assert.equal(calculateStreak([], '2026-05-25').state, 'inactive');
});
test('counts consecutive days 009', () => {
  assert.equal(calculateLongestStreak(['2026-05-23', '2026-05-24', '2026-05-25'], '2026-05-25'), 3);
});
test('detects an active streak 010', () => {
  const result = calculateStreak(['2026-05-24', '2026-05-25'], '2026-05-25');
  assert.equal(result.state, 'active');
  assert.equal(result.current, 2);
});
test('detects an at-risk streak 011', () => {
  const result = calculateStreak(['2026-05-24'], '2026-05-25');
  assert.equal(result.atRisk, true);
  assert.equal(result.current, 1);
});
test('calculates partial adherence 012', () => {
  const result = calculateAdherence({ checkins: [{ local_date: '2026-05-25', period: 'morning' }], today: '2026-05-25', trackingStartedOn: '2026-05-25', days: 1 });
  assert.equal(result.percentage, 50);
});
test('calculates complete adherence 013', () => {
  const checkins = [{ local_date: '2026-05-25', period: 'morning' }, { local_date: '2026-05-25', period: 'night' }];
  assert.equal(calculateAdherence({ checkins, today: '2026-05-25', trackingStartedOn: '2026-05-25', days: 1 }).completed, 2);
});
test('builds a thirteen-week heatmap 014', () => {
  const result = buildHeatmap({ today: '2026-05-25', trackingStartedOn: '2026-05-25', weeks: 13 });
  assert.equal(result.days.length, 91);
  assert.equal(result.weekStartsOn, 'sunday');
});
test('marks a complete heatmap day 015', () => {
  const checkins = [{ local_date: '2026-05-25', period: 'morning' }, { local_date: '2026-05-25', period: 'night' }];
  const day = buildHeatmap({ today: '2026-05-25', trackingStartedOn: '2026-05-25', weeks: 13, checkins }).days.find(item => item.date === '2026-05-25');
  assert.equal(day.state, 'complete');
});
test('preserves routine safety copy 016', () => {
  const routine = generateRulesRoutine();
  assert.equal(routine.safety.dermatologist, null);
  assert.match(routine.safety.patchTest, /Patch-test/);
});
test('normalizes legacy routine steps 017', () => {
  const routine = normalizeStoredRoutine(['Cleanser', 'Moisturizer']);
  assert.equal(routine.source, 'legacy');
  assert.equal(routine.morning.length, 2);
});
test('builds image quality guidance 018', () => {
  const warnings = buildQualityWarnings({ scanImage: { meetsRecommendedFaceCanvas: false }, imageQuality: { yaw: 35 } });
  assert.equal(warnings.length, 2);
  assert.equal(warnings[0].code, 'FACE_SIZE_BELOW_RECOMMENDATION');
});
test('keeps clean image guidance empty 019', () => {
  assert.deepEqual(buildQualityWarnings({ scanImage: { meetsRecommendedFaceCanvas: true }, imageQuality: { yaw: 0, pitch: 0, hairOcclusion: 0, glasses: false } }), []);
});
test('round-trips a history cursor 020', () => {
  const value = { createdAt: '2026-05-25T12:00:00.000Z', scanId: '00000000-0000-0000-0000-000000000001' };
  assert.deepEqual(decodeHistoryCursor(encodeHistoryCursor(value)), value);
});
test('rejects a bad history cursor 021', () => {
  assert.throws(() => decodeHistoryCursor('broken'), /Invalid history cursor/);
});
test('uses the default history limit 022', () => {
  assert.deepEqual(parseHistoryQuery({}), { limit: 12, cursor: null });
});
test('coerces a maximum history limit 023', () => {
  assert.equal(parseHistoryQuery({ limit: '25' }).limit, 25);
});
test('rejects an invalid history limit 024', () => {
  assert.throws(() => parseHistoryQuery({ limit: 0 }), /Invalid history limit/);
});
test('accepts a bounded metric 025', () => {
  const metric = { key: 'glow', label: 'Glow', value: 80, min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'glow-v1' };
  assert.equal(validMetric(metric), 'glow-v1');
});
test('rejects a metric direction typo 026', () => {
  const metric = { key: 'glow', label: 'Glow', value: 80, min: 0, max: 100, unit: 'points', direction: 'sideways', definition: 'glow-v1' };
  assert.equal(validMetric(metric), false);
});
test('rejects incomplete progress metrics', () => {
  assert.equal(validMetric({ key: 'glow' }), false);
  assert.equal(validMetric({ key: 'glow', label: 'Glow', value: 10, min: 5, max: 5, unit: 'points', direction: 'higher', definition: 'glow-v1' }), false);
});
