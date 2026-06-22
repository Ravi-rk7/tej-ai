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
  assert.equal(validMetric({ key: 'glow' }), null);
  assert.equal(validMetric({ key: 'glow', label: 'Glow', value: 10, min: 5, max: 5, unit: 'points', direction: 'higher', definition: 'glow-v1' }), false);
});
test('drops unsupported observations 027', () => {
  const result = normalizePortfolioResult({ schemaVersion: 2, scanId: 'sample-027', createdAt: '2026-06-03T12:00:00.000Z', source: 'sample', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, metrics: [], observations: [{ key: 'x', label: 'X', kind: 'unsupported', value: 'bad' }] });
  assert.deepEqual(result.observations, []);
});
test('reports a progress baseline 028', () => {
  const metric = { key: 'glow', label: 'Glow', value: 50, min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'glow-v1' };
  const result = buildPortfolioProgress([{ scanId: 'a', createdAt: '2026-06-01T12:00:00.000Z', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, overallScore: metric, metrics: [] }, { scanId: 'b', createdAt: '2026-06-02T12:00:00.000Z', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, overallScore: { ...metric, value: 55 }, metrics: [] }]);
  assert.equal(result[0].baselineDelta, 5);
});
test('serializes score bounds 029', () => {
  const result = serializeScanResult({ id: 'scan-029', created_at: '2026-06-03T12:00:00.000Z', provider: 'ailabtools', provider_version: 'v1', glow_score: 0, concerns: [], routine: [], metrics: {} });
  assert.equal(result.glowScore, 0);
});
test('normalizes missing scan scores 030', () => {
  const result = serializeScanResult({ id: 'scan-030', created_at: '2026-06-03T12:00:00.000Z', provider: 'ailabtools', provider_version: 'v1', glow_score: null, concerns: [], routine: [], metrics: {} });
  assert.equal(result.glowScore, null);
});
test('accepts an ISO month end 031', () => {
  assert.equal(parseCalendarDate('2026-07-31').day, 31);
  assert.equal(parseCalendarDate('2026-07-31').month, 7);
});
test('keeps incomplete metrics out of progress groups', () => {
  const metric = { key: 'glow', value: 80, min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'glow-v1' };
  assert.equal(validMetric(metric), null);
});
test('keeps year rollover arithmetic covered 032', () => {
  assert.equal(addCalendarDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addCalendarDays('2027-01-01', -1), '2026-12-31');
});
test('filters unknown warning codes 033', () => {
  assert.deepEqual(buildQualityWarnings({ imageQuality: { yaw: 5 } }), []);
});
test('maps hair occlusion guidance 034', () => {
  assert.equal(buildQualityWarnings({ imageQuality: { hairOcclusion: 0.5 } })[0].code, 'HAIR_OCCLUSION_ABOVE_RECOMMENDATION');
});
test('parses a small history page 035', () => {
  assert.equal(parseHistoryQuery({ limit: 3 }).limit, 3);
});
test('rejects a non-numeric history limit 036', () => {
  assert.throws(() => parseHistoryQuery({ limit: 'many' }), /Invalid history limit/);
});
test('accepts a lower-valued metric 037', () => {
  const metric = { key: 'pores', label: 'Pores', value: 1, min: 0, max: 5, unit: 'level', direction: 'lower', definition: 'pores-v1' };
  assert.equal(validMetric(metric), 'pores-v1');
});
test('rejects a missing metric definition 038', () => {
  const metric = { key: 'pores', label: 'Pores', value: 1, min: 0, max: 5, unit: 'level', direction: 'lower' };
  assert.equal(validMetric(metric), null);
});
test('normalizes an empty observation list 039', () => {
  const result = normalizePortfolioResult({ schemaVersion: 2, scanId: 'sample-039', createdAt: '2026-06-10T12:00:00.000Z', source: 'sample', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, metrics: [] });
  assert.deepEqual(result.observations, []);
});
test('retains a normalized skin type 040', () => {
  const result = normalizePortfolioResult({ schemaVersion: 2, scanId: 'sample-040', createdAt: '2026-06-10T12:00:00.000Z', source: 'sample', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, skinType: 'combination', metrics: [] });
  assert.equal(result.skinType, 'combination');
});
test('handles progress with no results 041', () => {
  assert.deepEqual(buildPortfolioProgress([]), []);
});
test('keeps one-point progress deltas null 042', () => {
  const metric = { key: 'glow', label: 'Glow', value: 70, min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'glow-v1' };
  const result = buildPortfolioProgress([{ scanId: 'one', createdAt: '2026-06-10T12:00:00.000Z', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, overallScore: metric, metrics: [] }]);
  assert.equal(result[0].previousDelta, null);
});
test('serializes an empty concern set 043', () => {
  const result = serializeScanResult({ id: 'scan-043', created_at: '2026-06-10T12:00:00.000Z', provider: 'ailabtools', provider_version: 'v1', glow_score: 72, concerns: [], routine: [], metrics: {} });
  assert.deepEqual(result.concerns, []);
});
test('keeps empty quality warnings out of legacy metrics 044', () => {
  const result = serializeScanResult({ id: 'scan-044', created_at: '2026-06-10T12:00:00.000Z', provider: 'ailabtools', provider_version: 'v1', glow_score: 72, concerns: [], routine: [], metrics: {} });
  assert.deepEqual(result.warnings, []);
});
test('covers forward date arithmetic 045', () => {
  assert.equal(addCalendarDays('2026-06-10', 7), '2026-06-17');
});
test('covers backward date arithmetic 046', () => {
  assert.equal(addCalendarDays('2026-06-10', -7), '2026-06-03');
});
test('rejects impossible month days 047', () => {
  assert.equal(parseCalendarDate('2026-06-31'), null);
});
test('accepts a second valid timezone 048', () => {
  assert.equal(validateTimezone('Asia/Kolkata'), true);
});
test('rejects a timezone with a leading slash 049', () => {
  assert.equal(validateTimezone('/UTC'), false);
});
test('finds the longest separated run 050', () => {
  assert.equal(calculateLongestStreak(['2026-06-01', '2026-06-02', '2026-06-10'], '2026-06-10'), 2);
});
test('does not mark an old run at risk 051', () => {
  assert.equal(calculateStreak(['2026-06-01'], '2026-06-10').state, 'inactive');
});
test('counts only supported adherence periods 052', () => {
  const result = calculateAdherence({ checkins: [{ local_date: '2026-06-10', period: 'morning' }, { local_date: '2026-06-10', period: 'afternoon' }], today: '2026-06-10', trackingStartedOn: '2026-06-10', days: 1 });
  assert.equal(result.completed, 1);
});
test('marks a partial heatmap day 053', () => {
  const map = buildHeatmap({ today: '2026-06-10', trackingStartedOn: '2026-06-10', weeks: 13, checkins: [{ local_date: '2026-06-10', period: 'morning' }] });
  assert.equal(map.days.find(day => day.date === '2026-06-10').state, 'partial');
});
test('normalizes a routine title fallback 054', () => {
  const routine = normalizeStoredRoutine({ morning: [{ title: 'Cleanser' }], night: [] });
  assert.equal(routine.morning[0].name, 'Cleanser');
});
test('filters unknown warning codes 055', () => {
  assert.deepEqual(buildQualityWarnings({ imageQuality: { yaw: 5 } }), []);
});
test('maps hair occlusion guidance 056', () => {
  assert.equal(buildQualityWarnings({ imageQuality: { hairOcclusion: 0.5 } })[0].code, 'HAIR_OCCLUSION_ABOVE_RECOMMENDATION');
});
test('parses a small history page 057', () => {
  assert.equal(parseHistoryQuery({ limit: 3 }).limit, 3);
});
test('rejects a non-numeric history limit 058', () => {
  assert.throws(() => parseHistoryQuery({ limit: 'many' }), /Invalid history limit/);
});
test('accepts a lower-valued metric 059', () => {
  const metric = { key: 'pores', label: 'Pores', value: 1, min: 0, max: 5, unit: 'level', direction: 'lower', definition: 'pores-v1' };
  assert.equal(validMetric(metric), 'pores-v1');
});
test('rejects a missing metric definition 060', () => {
  const metric = { key: 'pores', label: 'Pores', value: 1, min: 0, max: 5, unit: 'level', direction: 'lower' };
  assert.equal(validMetric(metric), null);
});
test('normalizes an empty observation list 061', () => {
  const result = normalizePortfolioResult({ schemaVersion: 2, scanId: 'sample-061', createdAt: '2026-06-10T12:00:00.000Z', source: 'sample', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, metrics: [] });
  assert.deepEqual(result.observations, []);
});
test('retains a normalized skin type 062', () => {
  const result = normalizePortfolioResult({ schemaVersion: 2, scanId: 'sample-062', createdAt: '2026-06-10T12:00:00.000Z', source: 'sample', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, skinType: 'combination', metrics: [] });
  assert.equal(result.skinType, 'combination');
});
test('handles progress with no results 063', () => {
  assert.deepEqual(buildPortfolioProgress([]), []);
});
test('keeps one-point progress deltas null 064', () => {
  const metric = { key: 'glow', label: 'Glow', value: 70, min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'glow-v1' };
  const result = buildPortfolioProgress([{ scanId: 'one', createdAt: '2026-06-10T12:00:00.000Z', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, overallScore: metric, metrics: [] }]);
  assert.equal(result[0].previousDelta, null);
});
test('serializes an empty concern set 065', () => {
  const result = serializeScanResult({ id: 'scan-065', created_at: '2026-06-10T12:00:00.000Z', provider: 'ailabtools', provider_version: 'v1', glow_score: 72, concerns: [], routine: [], metrics: {} });
  assert.deepEqual(result.concerns, []);
});
test('keeps empty quality warnings out of legacy metrics 066', () => {
  const result = serializeScanResult({ id: 'scan-066', created_at: '2026-06-10T12:00:00.000Z', provider: 'ailabtools', provider_version: 'v1', glow_score: 72, concerns: [], routine: [], metrics: {} });
  assert.deepEqual(result.warnings, []);
});
test('covers forward date arithmetic 067', () => {
  assert.equal(addCalendarDays('2026-06-10', 7), '2026-06-17');
});
test('covers backward date arithmetic 068', () => {
  assert.equal(addCalendarDays('2026-06-10', -7), '2026-06-03');
});
test('rejects impossible month days 069', () => {
  assert.equal(parseCalendarDate('2026-06-31'), null);
});
test('accepts a second valid timezone 070', () => {
  assert.equal(validateTimezone('Asia/Kolkata'), true);
});
test('rejects a timezone with a leading slash 071', () => {
  assert.equal(validateTimezone('/UTC'), false);
});
test('finds the longest separated run 072', () => {
  assert.equal(calculateLongestStreak(['2026-06-01', '2026-06-02', '2026-06-10'], '2026-06-10'), 2);
});
test('does not mark an old run at risk 073', () => {
  assert.equal(calculateStreak(['2026-06-01'], '2026-06-10').state, 'inactive');
});
test('counts only supported adherence periods 074', () => {
  const result = calculateAdherence({ checkins: [{ local_date: '2026-06-10', period: 'morning' }, { local_date: '2026-06-10', period: 'afternoon' }], today: '2026-06-10', trackingStartedOn: '2026-06-10', days: 1 });
  assert.equal(result.completed, 1);
});
test('marks a partial heatmap day 075', () => {
  const map = buildHeatmap({ today: '2026-06-10', trackingStartedOn: '2026-06-10', weeks: 13, checkins: [{ local_date: '2026-06-10', period: 'morning' }] });
  assert.equal(map.days.find(day => day.date === '2026-06-10').state, 'partial');
});
test('normalizes a routine title fallback 076', () => {
  const routine = normalizeStoredRoutine({ morning: [{ title: 'Cleanser' }], night: [] });
  assert.equal(routine.morning[0].name, 'Cleanser');
});
test('filters unknown warning codes 077', () => {
  assert.deepEqual(buildQualityWarnings({ imageQuality: { yaw: 5 } }), []);
});
test('maps hair occlusion guidance 078', () => {
  assert.equal(buildQualityWarnings({ imageQuality: { hairOcclusion: 0.5 } })[0].code, 'HAIR_OCCLUSION_ABOVE_RECOMMENDATION');
});
