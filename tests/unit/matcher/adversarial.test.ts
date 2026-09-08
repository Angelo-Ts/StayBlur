import { describe, expect, it } from 'vitest';

import { decideMatch } from '../../../src/core/matcher/decisionEngine.js';
import { rankCandidates } from '../../../src/core/matcher/scoreEngine.js';
import type { CandidateSnapshot } from '../../../src/core/matcher/scoringTypes.js';
import { sampleRule } from '../helpers/sampleRule.js';

const MIN_CATEGORY_CONTRIBUTION = 0.65;
const POLICY = {
  autoApplyThreshold: 0.85,
  ambiguousThreshold: 0.6,
  topGapAmbiguousDelta: 0.05,
  minIndependentCategories: 3
};

const candidate = (overrides: Partial<CandidateSnapshot> = {}): CandidateSnapshot => ({
  candidateId: 'candidate',
  tagName: 'section',
  id: 'settings-panel',
  semanticAttributes: [
    { name: 'role', valueKind: 'structural', value: 'region' },
    { name: 'aria-label', valueKind: 'hash', value: 'a'.repeat(64) }
  ],
  classNames: ['panel', 'secure'],
  normalizedTextHash: 'b'.repeat(64),
  ancestorContext: sampleRule().fingerprint.ancestorContext,
  structureContext: sampleRule().fingerprint.structureContext,
  geometricHint: sampleRule().fingerprint.geometricHint,
  cssSelectorMatched: false,
  ...overrides
});

describe('matcher adversarial safety cases', () => {
  it('never auto-applies from CSS selector support alone', () => {
    const rule = sampleRule();
    const ranked = rankCandidates({
      rule,
      minCategoryContribution: MIN_CATEGORY_CONTRIBUTION,
      candidates: [candidate({
        candidateId: 'css-only',
        id: undefined,
        semanticAttributes: [],
        classNames: [],
        normalizedTextHash: undefined,
        ancestorContext: { chain: [], depthCaptured: 0 },
        structureContext: {},
        geometricHint: undefined,
        cssSelectorMatched: true
      })]
    });

    const decision = decideMatch(rule, ranked, POLICY);

    expect(ranked.c1?.independentContributions).toBe(0);
    expect(decision.status).not.toBe('active');
  });

  it('does not auto-apply when the target loses its identifying classes and text', () => {
    const rule = sampleRule();
    const ranked = rankCandidates({
      rule,
      minCategoryContribution: MIN_CATEGORY_CONTRIBUTION,
      candidates: [candidate({
        candidateId: 'weakened',
        classNames: ['unrelated'],
        normalizedTextHash: 'c'.repeat(64),
        cssSelectorMatched: false
      })]
    });

    const decision = decideMatch(rule, ranked, POLICY);

    expect(decision.status).not.toBe('active');
  });

  it('stays ambiguous when two structurally similar candidates are tied', () => {
    const rule = sampleRule();
    const first = candidate({ candidateId: 'a' });
    const second = candidate({ candidateId: 'b' });
    const ranked = rankCandidates({
      rule,
      minCategoryContribution: MIN_CATEGORY_CONTRIBUTION,
      candidates: [first, second]
    });

    const decision = decideMatch(rule, ranked, POLICY);

    expect(decision.status).toBe('ambiguous');
    expect(decision.reason).toBe('top-candidates-too-close');
  });

  it('does not count a missing structure signal as an independent match', () => {
    const rule = sampleRule();
    const ranked = rankCandidates({
      rule,
      minCategoryContribution: MIN_CATEGORY_CONTRIBUTION,
      candidates: [candidate({
        structureContext: {},
        ancestorContext: { chain: [], depthCaptured: 0 },
        normalizedTextHash: undefined
      })]
    });

    expect(ranked.c1?.breakdown.structureContext.available).toBe(false);
    expect(ranked.c1?.independentContributions).toBe(3);
  });

  it('does not auto-apply when strong support signals accompany only two independent categories', () => {
    const rule = sampleRule();
    const ranked = rankCandidates({
      rule,
      minCategoryContribution: MIN_CATEGORY_CONTRIBUTION,
      candidates: [candidate({
        candidateId: 'two-independent',
        semanticAttributes: candidate().semanticAttributes,
        classNames: [],
        normalizedTextHash: undefined,
        ancestorContext: { chain: [], depthCaptured: 0 },
        structureContext: {},
        geometricHint: rule.fingerprint.geometricHint,
        cssSelectorMatched: true
      })]
    });

    expect(ranked.c1?.independentContributions).toBe(2);
    expect(ranked.c1?.totalScore).toBeGreaterThan(0.85);
    expect(decideMatch(rule, ranked, POLICY).status).toBe('ambiguous');
  });
});
