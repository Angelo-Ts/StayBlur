import { describe, expect, it } from 'vitest';

import { decideMatch } from '../../src/core/matcher/decisionEngine.js';
import { rankCandidates } from '../../src/core/matcher/scoreEngine.js';
import type { CandidateSnapshot } from '../../src/core/matcher/scoringTypes.js';
import { InMemoryStorageArea } from '../../src/core/storage/storageArea.js';
import { RuleRepository } from '../../src/core/storage/ruleRepository.js';
import { sampleRule } from '../unit/helpers/sampleRule.js';

const POLICY = {
  autoApplyThreshold: 0.85,
  ambiguousThreshold: 0.6,
  topGapAmbiguousDelta: 0.05,
  minIndependentCategories: 3
};

const MIN_CATEGORY_CONTRIBUTION = 0.65;

const candidateFromRule = (rule = sampleRule()): CandidateSnapshot => ({
  candidateId: 'page-target',
  tagName: rule.fingerprint.tagName,
  id: rule.fingerprint.stableId?.value,
  semanticAttributes: rule.fingerprint.semanticAttributes.map(({ name, valueKind, value }) => ({ name, valueKind, value })),
  classNames: rule.fingerprint.stableClasses.map(({ className }) => className),
  normalizedTextHash: rule.fingerprint.normalizedTextHash?.hash,
  ancestorContext: rule.fingerprint.ancestorContext,
  structureContext: rule.fingerprint.structureContext,
  geometricHint: rule.fingerprint.geometricHint,
  cssSelectorMatched: true
});

describe('matcher lifecycle integration', () => {
  it('loads a persisted rule, matches it, and records the current-page status', async () => {
    const storage = new InMemoryStorageArea();
    const repository = new RuleRepository(storage);
    const rule = sampleRule();

    await repository.save(rule);

    const persisted = await repository.getForPage(rule.domain, rule.path || '/');
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.ruleId).toBe(rule.ruleId);

    const ranked = rankCandidates({
      rule: persisted[0]!,
      candidates: [candidateFromRule(persisted[0]!)],
      minCategoryContribution: MIN_CATEGORY_CONTRIBUTION
    });
    const decision = decideMatch(persisted[0]!, ranked, POLICY);

    expect(decision.status).toBe('active');
    expect(decision.reason).toBe('safe-auto-apply');
    expect(decision.selectedCandidate?.candidateId).toBe('page-target');

    const updated = await repository.setRuntimeStatus(
      rule.ruleId,
      decision.status,
      { domain: rule.domain, path: rule.path || '/', evaluatedAt: '2026-09-08T00:00:00.000Z' },
      decision.confidence
    );

    expect(updated?.status).toBe('active');
    expect(updated?.enabled).toBe(true);
    expect(updated?.statusContext?.path).toBe(rule.path || '/');
    expect(updated?.lastConfidence).toBe(decision.confidence);
  });

  it('keeps a persisted rule when the current candidate becomes ambiguous', async () => {
    const storage = new InMemoryStorageArea();
    const repository = new RuleRepository(storage);
    const rule = sampleRule();

    await repository.save(rule);

    const first = candidateFromRule(rule);
    const second = { ...candidateFromRule(rule), candidateId: 'page-lookalike' };
    const ranked = rankCandidates({
      rule,
      candidates: [first, second],
      minCategoryContribution: MIN_CATEGORY_CONTRIBUTION
    });
    const decision = decideMatch(rule, ranked, POLICY);

    expect(decision.status).toBe('ambiguous');

    const updated = await repository.setRuntimeStatus(
      rule.ruleId,
      decision.status,
      { domain: rule.domain, path: rule.path || '/', evaluatedAt: '2026-09-08T00:01:00.000Z' },
      decision.confidence
    );

    expect(updated?.status).toBe('ambiguous');
    expect(updated?.enabled).toBe(true);
    expect(await repository.get(rule.ruleId)).toBeDefined();
  });
});
