import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deriveSkinInsights, severityForScore } from '../services/skinInsightsService.js';
import { normalizeProviderResponse } from '../services/skinAnalysisService.js';

const fixtureUrl = (name) => new URL(`./fixtures/ailabtools/${name}`, import.meta.url);

const readFixture = async (name) => JSON.parse(await readFile(fixtureUrl(name), 'utf8'));

const scoreInfo = (value) => ({
    totalScore: value,
    skinTypeScore: 80,
    darkCircleScore: 100,
    wrinkleScore: 100,
    oilyIntensityScore: 100,
    poresScore: 100,
    blackheadScore: 100,
    acneScore: 100,
    sensitivityScore: 100,
    melaninScore: 100,
    waterScore: 100,
    roughScore: 100,
});

test('uses provider total score directly and preserves the full health-score set', () => {
    const insights = deriveSkinInsights({
        ...scoreInfo(84),
        acneScore: 76,
        melaninScore: 68,
        roughScore: 89,
    });

    assert.equal(insights.glowScore, 84);
    assert.equal(insights.metrics.totalScore, 84);
    assert.equal(insights.metrics.healthScores.acne, 76);
    assert.deepEqual(insights.concernDetails, [
        { key: 'pigmentation', label: 'Pigmentation', score: 68, severity: 'moderate' },
        { key: 'acne', label: 'Acne', score: 76, severity: 'mild' },
        { key: 'texture', label: 'Texture', score: 89, severity: 'mild' },
    ]);
});

test('maps all severity boundaries in the documented healthy-score direction', () => {
    assert.equal(severityForScore(0), 'severe');
    assert.equal(severityForScore(49), 'severe');
    assert.equal(severityForScore(50), 'moderate');
    assert.equal(severityForScore(69), 'moderate');
    assert.equal(severityForScore(70), 'mild');
    assert.equal(severityForScore(89), 'mild');
    assert.equal(severityForScore(90), 'none');
    assert.equal(severityForScore(100), 'none');
});

test('omits none concerns and excludes total/skin-type scores from concern mapping', () => {
    const insights = deriveSkinInsights({
        ...scoreInfo(100),
        acneScore: 49,
        skinTypeScore: 0,
    });

    assert.deepEqual(insights.concerns, ['Acne']);
    assert.equal(insights.concernDetails[0].severity, 'severe');
    assert.equal(insights.concernDetails.some(({ key }) => key === 'total_score'), false);
    assert.equal(insights.concernDetails.some(({ key }) => key === 'skin_type'), false);
});

test('normalizes the provider fixture into the canonical insight input', async () => {
    const fixture = await readFixture('skin-analysis-success.json');
    const providerResult = normalizeProviderResponse(fixture);
    const insights = deriveSkinInsights(providerResult.scoreInfo);

    assert.equal(insights.glowScore, 84);
    assert.deepEqual(insights.concerns, ['Pigmentation', 'Acne', 'Oiliness', 'Pores', 'Dryness / dehydration', 'Sensitivity', 'Texture']);
});
