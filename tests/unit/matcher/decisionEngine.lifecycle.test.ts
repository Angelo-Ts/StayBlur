import { describe, expect, it } from 'vitest';

import { decideMatch, withStatusContext } from '../../../src/core/matcher/decisionEngine.js';
import type { CandidateScore, RankedCandidates } from '../../../src/core/matcher/scoringTypes.js';
import { sampleRule } from '../helpers/sampleRule.js';

const POLICY = {
  autoApplyThreshold: 0.85,
  ambiguousThreshold: 0.6,
  topGapAmbiguousDelta: 0.05,
  minIndependentCategories: 3
};

const score = (candidateId: string, totalScore: number, independentContributions: number): CandidateScore => ({
  candidateId,
  totalScore,
  independentContributions,
  breakdown: {
    stableId: { score: 1, available: true },
    semanticAttributes: { score: 1, available: true },
    textHash: { score: 1, available: true },
    stableClasses: { score: 0, available: false },
    ancestorContext: { score: 0, available: false },
    structureContext: { score: 0, available: false },
    cssSelector: { score: 1, available: true },
    geometry: { score: 0, available: false },
    tagName: { score: 1, available: true }
  }
});

const ranked = (c1?: CandidateScore, c2?: CandidateScore): RankedCandidates => ({
  sorted: [c1, c2].filter(Boolean) as CandidateScore[],
  c1,
  c2
});

describe('matcher decision lifecycle', () => {
  it('returns disabled before evaluating candidates when a rule is disabled', () => {
    const rule = { ...sampleRule(), enabled: false };
    const decision = decideMatch(rule, ranked(score('ignored', 1, 6)), POLICY);

    expect(decision.status).toBe('disabled');
    expect(decision.reason).toBe('rule-disabled');
    expect(decision.selectedCandidate).toBeUndefined();
  });

  it('reports notFound when no candidate is available', () => {
    const decision = decideMatch(sampleRule(), ranked(), POLICY);

    expect(decision.status).toBe('notFound');
    expect(decision.reason).toBe('no-candidate');
    expect(decision.confidence).toBe(0);
  });

  it('keeps a high score ambiguous when independent evidence is insufficient', () => {
    const decision = decideMatch(
      sampleRule(),
      ranked(score('candidate', 0.97, 2)),
      POLICY
    );

    expect(decision.status).toBe('ambiguous');
    expect(decision.reason).toBe('insufficient-independent-categories');
  });

  it('rejects a low-confidence candidate instead of applying it', () => {
    const decision = decideMatch(
      sampleRule(),
      ranked(score('candidate', 0.42, 6)),
      POLICY
    );

    expect(decision.status).toBe('notFound');
    expect(decision.reason).toBe('below-ambiguous-threshold');
  });

  it('updates active timestamps but preserves the last match for non-active states', () => {
    const rule = sampleRule();
    const context = {
      domain: 'example.com',
      path: '/settings',
      evaluatedAt: '2026-09-08T10:00:00.000Z'
    };

    const active = withStatusContext(rule, 'active', context, 0.93);
    const ambiguous = withStatusContext(rule, 'ambiguous', context, 0.72);

    expect(active.lastMatchedAt).toBe(context.evaluatedAt);
    expect(active.lastConfidence).toBe(0.93);
    expect(ambiguous.lastMatchedAt).toBe(rule.lastMatchedAt);
    expect(ambiguous.lastConfidence).toBe(0.72);
    expect(ambiguous.updatedAt).toBe(context.evaluatedAt);
  });
});
