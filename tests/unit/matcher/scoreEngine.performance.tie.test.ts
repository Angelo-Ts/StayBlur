import { describe, expect, it } from 'vitest';

import { rankCandidates } from '../../../src/core/matcher/scoreEngine.js';
import type { CandidateSnapshot } from '../../../src/core/matcher/scoringTypes.js';
import { sampleRule } from '../helpers/sampleRule.js';

const MIN_CATEGORY_CONTRIBUTION = 0.65;

describe('matcher deterministic ranking', () => {
  it('uses a locale-independent candidate id tie-breaker', () => {
    const rule = sampleRule();
    const base: CandidateSnapshot = {
      candidateId: 'base',
      tagName: rule.fingerprint.tagName,
      id: undefined,
      semanticAttributes: [],
      classNames: [],
      ancestorContext: rule.fingerprint.ancestorContext,
      structureContext: rule.fingerprint.structureContext,
      geometricHint: rule.fingerprint.geometricHint,
      cssSelectorMatched: false
    };
    const candidates = [
      { ...base, candidateId: 'zeta' },
      { ...base, candidateId: 'alpha' },
      { ...base, candidateId: 'beta' }
    ];

    const ranked = rankCandidates({ rule, candidates, minCategoryContribution: MIN_CATEGORY_CONTRIBUTION });

    expect(ranked.sorted.map(({ candidateId }) => candidateId)).toEqual(['alpha', 'beta', 'zeta']);
  });
});
