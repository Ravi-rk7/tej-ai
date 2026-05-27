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
