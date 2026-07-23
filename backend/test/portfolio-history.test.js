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
test('parses a small history page 079', () => {
  assert.equal(parseHistoryQuery({ limit: 3 }).limit, 3);
});
test('rejects a non-numeric history limit 080', () => {
  assert.throws(() => parseHistoryQuery({ limit: 'many' }), /Invalid history limit/);
});
test('accepts a lower-valued metric 081', () => {
  const metric = { key: 'pores', label: 'Pores', value: 1, min: 0, max: 5, unit: 'level', direction: 'lower', definition: 'pores-v1' };
  assert.equal(validMetric(metric), 'pores-v1');
});
test('rejects a missing metric definition 082', () => {
  const metric = { key: 'pores', label: 'Pores', value: 1, min: 0, max: 5, unit: 'level', direction: 'lower' };
  assert.equal(validMetric(metric), null);
});
test('normalizes an empty observation list 083', () => {
  const result = normalizePortfolioResult({ schemaVersion: 2, scanId: 'sample-083', createdAt: '2026-06-10T12:00:00.000Z', source: 'sample', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, metrics: [] });
  assert.deepEqual(result.observations, []);
});
test('rejects blank routine names 084', () => {
  assert.equal(normalizeStoredRoutine({ morning: [{ name: '  ' }], night: [] }), null);
});
test('maps a yaw warning 085', () => {
  assert.equal(buildQualityWarnings({ imageQuality: { yaw: -31 } })[0].code, 'FACE_YAW_ABOVE_RECOMMENDATION');
});
test('maps face size guidance 086', () => {
  assert.equal(buildQualityWarnings({ imageQuality: { faceRatio: 0.4 } })[0].code, 'FACE_SIZE_BELOW_RECOMMENDATION');
});
test('round-trips a second cursor 087', () => {
  const value = { createdAt: '2026-07-01T12:00:00.000Z', scanId: '00000000-0000-0000-0000-000000000004' };
  assert.deepEqual(decodeHistoryCursor(encodeHistoryCursor(value)), value);
});
test('rejects a missing cursor object 088', () => {
  assert.equal(decodeHistoryCursor(undefined), null);
});
test('parses an explicit history limit 089', () => {
  assert.equal(parseHistoryQuery({ limit: '12' }).limit, 12);
});
test('rejects a negative history limit 090', () => {
  assert.throws(() => parseHistoryQuery({ limit: -1 }), /Invalid history limit/);
});
test('accepts a neutral metric direction 091', () => {
  const metric = { key: 'texture', label: 'Texture', value: 2, min: 0, max: 5, unit: 'level', direction: 'neutral', definition: 'texture-v1' };
  assert.equal(validMetric(metric), 'texture-v1');
});
test('rejects an inverted metric range 092', () => {
  const metric = { key: 'texture', label: 'Texture', value: 2, min: 5, max: 0, unit: 'level', direction: 'neutral', definition: 'texture-v1' };
  assert.equal(validMetric(metric), false);
});
test('normalizes a portfolio routine fallback 093', () => {
  const result = normalizePortfolioResult({ schemaVersion: 2, scanId: 'sample-093', createdAt: '2026-07-01T12:00:00.000Z', source: 'sample', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, metrics: [] });
  assert.equal(result.routine.source, 'rules');
});
test('drops an invalid portfolio metric 094', () => {
  const result = normalizePortfolioResult({ schemaVersion: 2, scanId: 'sample-094', createdAt: '2026-07-01T12:00:00.000Z', source: 'sample', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, metrics: [{ key: 'bad', label: 'Bad', value: 4, min: 0, max: 5, unit: 'level', direction: 'sideways', definition: 'bad-v1' }] });
  assert.equal(result, null);
});
test('keeps progress input immutable 095', () => {
  const metric = { key: 'glow', label: 'Glow', value: 70, min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'glow-v1' };
  const input = [{ scanId: 'one', createdAt: '2026-07-01T12:00:00.000Z', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, overallScore: metric, metrics: [] }];
  buildPortfolioProgress(input);
  assert.equal(input[0].overallScore.value, 70);
});
test('serializes a null skin type 096', () => {
  const result = serializeScanResult({ id: 'scan-096', created_at: '2026-07-01T12:00:00.000Z', provider: 'ailabtools', provider_version: 'v1', glow_score: 70, skin_type: null, concerns: [], routine: [], metrics: {} });
  assert.equal(result.skinType, null);
});
test('covers June month rollover 097', () => {
  assert.equal(addCalendarDays('2026-06-30', 1), '2026-07-01');
});
test('covers July month rollover 098', () => {
  assert.equal(addCalendarDays('2026-07-31', 1), '2026-08-01');
});
test('rejects portfolio results with invalid dates', () => {
  const result = normalizePortfolioResult({ schemaVersion: 2, scanId: 'sample-invalid-date', createdAt: 'not-a-date', source: 'sample', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, metrics: [] });
  assert.equal(result, null);
});
test('rejects a date with trailing text 099', () => {
  assert.equal(parseCalendarDate('2026-07-01x'), null);
});
test('accepts a regional timezone 100', () => {
  assert.equal(validateTimezone('Australia/Sydney'), true);
});
test('rejects a timezone with a bad segment 101', () => {
  assert.equal(validateTimezone('America/'), false);
});
test('counts a separated longest run 102', () => {
  assert.equal(calculateLongestStreak(['2026-07-01', '2026-07-03', '2026-07-04'], '2026-07-04'), 2);
});
test('keeps a missing current day at risk 103', () => {
  assert.equal(calculateStreak(['2026-07-03'], '2026-07-04').state, 'at_risk');
});
test('adherence uses both routine periods 104', () => {
  const result = calculateAdherence({ checkins: [{ local_date: '2026-07-04', period: 'night' }], today: '2026-07-04', trackingStartedOn: '2026-07-04', days: 1 });
  assert.equal(result.completed, 1);
  assert.equal(result.possible, 2);
});
test('marks a missed day in the heatmap 105', () => {
  const map = buildHeatmap({ today: '2026-07-04', trackingStartedOn: '2026-07-04', weeks: 13 });
  assert.equal(map.days.find(day => day.date === '2026-07-04').state, 'missed');
});
test('keeps generated routine source stable 106', () => {
  assert.equal(generateRulesRoutine().source, 'rules');
});
test('normalizes a night routine step 107', () => {
  const routine = normalizeStoredRoutine({ morning: [], night: [{ name: 'Moisturizer', instructions: 'Apply' }] });
  assert.equal(routine.night[0].name, 'Moisturizer');
});
test('rejects routine whitespace-only steps 108', () => {
  assert.equal(normalizeStoredRoutine({ morning: [], night: [{ name: ' ' }] }), null);
});
test('maps a pitch threshold warning 109', () => {
  assert.equal(buildQualityWarnings({ imageQuality: { pitch: -45 } })[0].code, 'FACE_PITCH_ABOVE_RECOMMENDATION');
});
test('maps a hair occlusion threshold 110', () => {
  assert.equal(buildQualityWarnings({ imageQuality: { hairOcclusion: 0.41 } })[0].code, 'HAIR_OCCLUSION_ABOVE_RECOMMENDATION');
});
test('preserves cursor timestamps 111', () => {
  const value = { createdAt: '2026-07-04T12:00:00.000Z', scanId: '00000000-0000-0000-0000-000000000005' };
  assert.equal(decodeHistoryCursor(encodeHistoryCursor(value)).createdAt, value.createdAt);
});
test('treats an empty cursor as absent 112', () => {
  assert.equal(decodeHistoryCursor(''), null);
});
test('parses the minimum history limit 113', () => {
  assert.equal(parseHistoryQuery({ limit: '1' }).limit, 1);
});
test('rejects a decimal history limit 114', () => {
  assert.throws(() => parseHistoryQuery({ limit: '2.5' }), /Invalid history limit/);
});
test('accepts a metric at its maximum 115', () => {
  const metric = { key: 'glow', label: 'Glow', value: 100, min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'glow-v1' };
  assert.equal(validMetric(metric), 'glow-v1');
});
test('rejects a metric below its minimum 116', () => {
  const metric = { key: 'glow', label: 'Glow', value: -1, min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'glow-v1' };
  assert.equal(validMetric(metric), false);
});
test('normalizes provider mapping metadata 117', () => {
  const result = normalizePortfolioResult({ schemaVersion: 2, scanId: 'sample-117', createdAt: '2026-07-04T12:00:00.000Z', source: 'sample', provider: { name: 'facepp', mappingVersion: 'categories-v2' }, metrics: [] });
  assert.equal(result.provider.mappingVersion, 'categories-v2');
});
test('keeps unsupported observation kinds out 118', () => {
  const result = normalizePortfolioResult({ schemaVersion: 2, scanId: 'sample-118', createdAt: '2026-07-04T12:00:00.000Z', source: 'sample', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, metrics: [], observations: [{ key: 'x', label: 'X', kind: 'other', value: 'X' }] });
  assert.equal(result.observations.length, 0);
});
test('keeps progress baseline for one scan 119', () => {
  const metric = { key: 'glow', label: 'Glow', value: 70, min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'glow-v1' };
  const result = buildPortfolioProgress([{ scanId: 'one', createdAt: '2026-07-04T12:00:00.000Z', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, overallScore: metric, metrics: [] }]);
  assert.equal(result[0].baselineDelta, null);
});
test('serializes legacy provider defaults 120', () => {
  const result = serializeScanResult({ id: 'scan-120', created_at: '2026-07-04T12:00:00.000Z', glow_score: 55, concerns: [], routine: [], metrics: {} });
  assert.equal(result.provider.name, 'ailabtools');
});
test('covers a summer month boundary 121', () => {
  assert.equal(addCalendarDays('2026-07-31', 1), '2026-08-01');
});
test('covers a short forward range 122', () => {
  assert.equal(addCalendarDays('2026-07-08', 3), '2026-07-11');
});
test('rejects a date with trailing text 123', () => {
  assert.equal(parseCalendarDate('2026-07-01x'), null);
});
test('accepts a regional timezone 124', () => {
  assert.equal(validateTimezone('Australia/Sydney'), true);
});
test('rejects a timezone with a bad segment 125', () => {
  assert.equal(validateTimezone('America/'), false);
});
test('counts a separated longest run 126', () => {
  assert.equal(calculateLongestStreak(['2026-07-01', '2026-07-03', '2026-07-04'], '2026-07-04'), 2);
});
test('keeps a missing current day at risk 127', () => {
  assert.equal(calculateStreak(['2026-07-03'], '2026-07-04').state, 'at_risk');
});
test('adherence uses both routine periods 128', () => {
  const result = calculateAdherence({ checkins: [{ local_date: '2026-07-04', period: 'night' }], today: '2026-07-04', trackingStartedOn: '2026-07-04', days: 1 });
  assert.equal(result.completed, 1);
  assert.equal(result.possible, 2);
});
test('marks a missed day in the heatmap 129', () => {
  const map = buildHeatmap({ today: '2026-07-04', trackingStartedOn: '2026-07-04', weeks: 13 });
  assert.equal(map.days.find(day => day.date === '2026-07-04').state, 'missed');
});
test('keeps generated routine source stable 130', () => {
  assert.equal(generateRulesRoutine().source, 'rules');
});
test('normalizes a night routine step 131', () => {
  const routine = normalizeStoredRoutine({ morning: [], night: [{ name: 'Moisturizer', instructions: 'Apply' }] });
  assert.equal(routine.night[0].name, 'Moisturizer');
});
test('rejects routine whitespace-only steps 132', () => {
  assert.equal(normalizeStoredRoutine({ morning: [], night: [{ name: ' ' }] }), null);
});
test('maps a pitch threshold warning 133', () => {
  assert.equal(buildQualityWarnings({ imageQuality: { pitch: -45 } })[0].code, 'FACE_PITCH_ABOVE_RECOMMENDATION');
});
test('maps a hair occlusion threshold 134', () => {
  assert.equal(buildQualityWarnings({ imageQuality: { hairOcclusion: 0.41 } })[0].code, 'HAIR_OCCLUSION_ABOVE_RECOMMENDATION');
});
test('preserves cursor timestamps 135', () => {
  const value = { createdAt: '2026-07-04T12:00:00.000Z', scanId: '00000000-0000-0000-0000-000000000005' };
  assert.equal(decodeHistoryCursor(encodeHistoryCursor(value)).createdAt, value.createdAt);
});
test('treats an empty cursor as absent 136', () => {
  assert.equal(decodeHistoryCursor(''), null);
});
test('parses the minimum history limit 137', () => {
  assert.equal(parseHistoryQuery({ limit: '1' }).limit, 1);
});
test('rejects a decimal history limit 138', () => {
  assert.throws(() => parseHistoryQuery({ limit: '2.5' }), /Invalid history limit/);
});
test('round-trips a history cursor 139', () => {
  const value = { createdAt: '2026-07-15T12:00:00.000Z', scanId: '00000000-0000-0000-0000-000000000008' };
  assert.deepEqual(decodeHistoryCursor(encodeHistoryCursor(value)), value);
});
test('rejects a decimal history limit 140', () => {
  assert.throws(() => parseHistoryQuery({ limit: 2.5 }), /Invalid history limit/);
});
test('accepts a metric at its maximum 141', () => {
  const metric = { key: 'glow', label: 'Glow', value: 100, min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'glow-v1' };
  assert.equal(validMetric(metric), 'glow-v1');
});
test('normalizes sample warnings 142', () => {
  const result = normalizePortfolioResult({ schemaVersion: 2, scanId: 'sample-142', createdAt: '2026-07-15T12:00:00.000Z', source: 'sample', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, metrics: [] });
  assert.equal(result.warnings.length, 1);
});
test('keeps a progress baseline null 143', () => {
  const metric = { key: 'glow', label: 'Glow', value: 70, min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'glow-v1' };
  const result = buildPortfolioProgress([{ scanId: 'one', createdAt: '2026-07-15T12:00:00.000Z', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, overallScore: metric, metrics: [] }]);
  assert.equal(result[0].baselineDelta, null);
});
test('serializes a null skin type 144', () => {
  const result = serializeScanResult({ id: 'scan-144', created_at: '2026-07-15T12:00:00.000Z', provider: 'ailabtools', provider_version: 'v1', glow_score: 70, skin_type: null, concerns: [], routine: [], metrics: {} });
  assert.equal(result.skinType, null);
});
test('covers a mid-month range 145', () => {
  assert.equal(addCalendarDays('2026-07-15', 14), '2026-07-29');
});
test('rejects an invalid month 146', () => {
  assert.equal(parseCalendarDate('2026-13-01'), null);
});
test('accepts a regional timezone 147', () => {
  assert.equal(validateTimezone('Africa/Nairobi'), true);
});
test('rejects an unknown timezone 148', () => {
  assert.equal(validateTimezone('Mars/Colony'), false);
});
test('finds a longest run after a gap 149', () => {
  assert.equal(calculateLongestStreak(['2026-07-01', '2026-07-02', '2026-07-04'], '2026-07-04'), 2);
});
test('keeps a new streak inactive 150', () => {
  assert.equal(calculateStreak([], '2026-07-15').state, 'inactive');
});
test('calculates an empty adherence window 151', () => {
  assert.equal(calculateAdherence({ checkins: [], today: '2026-07-15', trackingStartedOn: '2026-07-15', days: 1 }).percentage, 0);
});
test('builds a future heatmap cell 152', () => {
  const map = buildHeatmap({ today: '2026-07-15', trackingStartedOn: '2026-07-15', weeks: 13 });
  assert.equal(map.days.at(-1).level, 0);
});
test('normalizes a routine fallback 153', () => {
  assert.equal(normalizeStoredRoutine({ morning: [{ title: 'Cleanser' }], night: [] }).morning[0].name, 'Cleanser');
});
test('maps a glasses warning 154', () => {
  assert.equal(buildQualityWarnings({ imageQuality: { glasses: true } })[0].code, 'GLASSES_DETECTED');
});
test('round-trips a history cursor 155', () => {
  const value = { createdAt: '2026-07-15T12:00:00.000Z', scanId: '00000000-0000-0000-0000-000000000008' };
  assert.deepEqual(decodeHistoryCursor(encodeHistoryCursor(value)), value);
});
test('rejects a decimal history limit 156', () => {
  assert.throws(() => parseHistoryQuery({ limit: 2.5 }), /Invalid history limit/);
});
test('accepts a metric at its maximum 157', () => {
  const metric = { key: 'glow', label: 'Glow', value: 100, min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'glow-v1' };
  assert.equal(validMetric(metric), 'glow-v1');
});
test('normalizes sample warnings 158', () => {
  const result = normalizePortfolioResult({ schemaVersion: 2, scanId: 'sample-158', createdAt: '2026-07-15T12:00:00.000Z', source: 'sample', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, metrics: [] });
  assert.equal(result.warnings.length, 1);
});
test('keeps a progress baseline null 159', () => {
  const metric = { key: 'glow', label: 'Glow', value: 70, min: 0, max: 100, unit: 'points', direction: 'higher', definition: 'glow-v1' };
  const result = buildPortfolioProgress([{ scanId: 'one', createdAt: '2026-07-15T12:00:00.000Z', provider: { name: 'facepp', mappingVersion: 'categories-v1' }, overallScore: metric, metrics: [] }]);
  assert.equal(result[0].baselineDelta, null);
});
test('serializes a null skin type 160', () => {
  const result = serializeScanResult({ id: 'scan-160', created_at: '2026-07-15T12:00:00.000Z', provider: 'ailabtools', provider_version: 'v1', glow_score: 70, skin_type: null, concerns: [], routine: [], metrics: {} });
  assert.equal(result.skinType, null);
});
test('covers a mid-month range 161', () => {
  assert.equal(addCalendarDays('2026-07-15', 14), '2026-07-29');
});
test('rejects an invalid month 162', () => {
  assert.equal(parseCalendarDate('2026-13-01'), null);
});
test('accepts a regional timezone 163', () => {
  assert.equal(validateTimezone('Africa/Nairobi'), true);
});
test('rejects an unknown timezone 164', () => {
  assert.equal(validateTimezone('Mars/Colony'), false);
});
test('finds a longest run after a gap 165', () => {
  assert.equal(calculateLongestStreak(['2026-07-01', '2026-07-02', '2026-07-04'], '2026-07-04'), 2);
});
