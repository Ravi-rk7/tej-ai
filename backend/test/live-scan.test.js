import test from 'node:test';
import assert from 'node:assert/strict';
import { createFaceppAnalyzer, normalizeFaceppResponse } from '../services/faceppSkinAnalysisService.js';
import { createPortfolioDeletionService } from '../services/portfolioDeletionService.js';

test('Face++ categories remain observations without invented scores', () => {
  const result = normalizeFaceppResponse({ result: { skin_type: 3, acne: { value: 1, confidence: 0.8 } } });
  assert.equal(result.skinType, 'Combination');
  assert.equal(result.overallScore, null);
  assert.deepEqual(result.metrics, []);
  assert.equal(result.observations[0].value, 'Reported present');
});

test('multiple faces and unusable provider results are rejected', () => {
  for (const result of [[], [{ skin_type: 0 }, { skin_type: 1 }], {}]) {
    assert.throws(() => normalizeFaceppResponse({ result }), { publicCode: 'PROVIDER_RESULT_UNSUPPORTED' });
  }
});

test('provider failures are not retried and do not disclose request secrets', async () => {
  let calls = 0;
  const analyze = createFaceppAnalyzer({
    runtimeEnv: { LIVE_SCAN_ENABLED: true, FACEPP_API_KEY: 'test-key', FACEPP_API_SECRET: 'test-secret' },
    httpClient: { post: async () => { calls++; throw new Error('test-secret'); } },
  });
  await assert.rejects(analyze(Buffer.from('test-image')), error => error.publicCode === 'PROVIDER_UNAVAILABLE' && !error.message.includes('test-secret'));
  assert.equal(calls, 1);
});

test('disabled scanning makes no provider request', async () => {
  const analyze = createFaceppAnalyzer({ runtimeEnv: { LIVE_SCAN_ENABLED: false }, httpClient: { post: () => assert.fail('provider must not run') } });
  await assert.rejects(analyze(Buffer.from('image')), { publicCode: 'LIVE_SCAN_DISABLED' });
});

test('OAuth account deletion accepts verified evidence independent of provider', async () => {
  let deleted = false;
  const service = createPortfolioDeletionService({
    runtimeEnv: { DELETION_AUDIT_HMAC_SECRET: 'x'.repeat(32) },
    rpc: async (name, args) => {
      assert.equal(name, 'consume_portfolio_deletion_challenge');
      assert.equal(args.p_oauth_at, 123);
      return true;
    },
    deletionRepository: {
      claimAccountDeletion: async () => ({ claimed: true, auditId: 'audit' }),
      getAccountSubscription: async () => null,
      clearLegacyImageReferences: async () => {},
      markAudit: async () => {},
    },
    removeAuthUser: async () => { deleted = true; return { error: null }; },
  });
  await service.deleteAccount({ userId: 'test-user', authEvidence: {
    challengeId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    amr: [{ method: 'oauth', timestamp: 123 }],
  } });
  assert.equal(deleted, true);
  await assert.rejects(service.deleteAccount({ userId: 'test-user', authEvidence: {} }), { publicCode: 'ACCOUNT_REAUTHENTICATION_FAILED' });
});
