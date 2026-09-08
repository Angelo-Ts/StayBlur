import { describe, expect, it } from 'vitest';

import { decideMatch } from '../../../src/core/matcher/decisionEngine.js';
import { scoreCandidate } from '../../../src/core/matcher/scoreEngine.js';
import type { CandidateSnapshot, RankedCandidates } from '../../../src/core/matcher/scoringTypes.js';
import { sampleRule } from '../helpers/sampleRule.js';

const POLICY = {
  autoApplyThreshold: 0.85,
  ambiguousThreshold: 0.6,
  topGapAmbiguousDelta: 0.05,
  minIndependentCategories: 3
};

const candidateWithOnlySupportSignals = (): CandidateSnapshot => ({
  candidateId: 'support-only',
  tagName: sampleRule().fingerprint.tagName,
  semanticAttributes: [],
  classNames: [],
  ancestorContext: { chain: [], depthCaptured: 0 },
  structureContext: {
    siblingSignature: {},
    childSignature: { stableChildTagsTopK: [], stableChildRolesTopK: [] }
  },
  cssSelectorMatched: true
});

describe('matcher safety evidence', () => {
  it('does not count CSS selector and tag name as independent evidence', () => {
    const rule = sampleRule();
    const score = scoreCandidate(rule.fingerprint, candidateWithOnlySupportSignals(), 0.65);

    expect(score.breakdown.cssSelector).toEqual({ score: 1, available: true });
    expect(score.breakdown.tagName).toEqual({ score: 1, available: true });
    expect(score.independentContributions).toBe(0);
  });

  it('does not auto-apply a match supported only by non-independent signals', () => {
    const rule = sampleRule();
    const candidate = scoreCandidate(rule.fingerprint, candidateWithOnlySupportSignals(), 0.65);
    const ranked: RankedCandidates = { sorted: [candidate], c1: candidate };

    const decision = decideMatch(rule, ranked, POLICY);
    expect(['notFound', 'ambiguous']).toContain(decision.status);
    expect(decision.status).not.toBe('active');
  });
});
