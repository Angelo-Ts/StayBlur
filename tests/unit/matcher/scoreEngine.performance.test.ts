import { describe, expect, it } from 'vitest';

import { rankCandidates } from '../../../src/core/matcher/scoreEngine.js';
import type { CandidateSnapshot } from '../../../src/core/matcher/scoringTypes.js';
import { sampleRule } from '../helpers/sampleRule.js';

const MIN_CATEGORY_CONTRIBUTION = 0.65;

const makeCandidate = (index: number, target: CandidateSnapshot): CandidateSnapshot => ({
  ...target,
  candidateId: `candidate-${index}`,
  id: index === 9999 ? target.id : `other-${index}`,
  classNames: index === 9999 ? target.classNames : ['unrelated', `variant-${index % 20}`],
  normalizedTextHash: index === 9999 ? target.normalizedTextHash : undefined,
  cssSelectorMatched: index === 9999
});

describe('matcher scoring at scale', () => {
  it('ranks a large candidate set deterministically without mutating the input', () => {
    const rule = sampleRule();
    const target: CandidateSnapshot = {
      candidateId: 'target',
      tagName: rule.fingerprint.tagName,
      id: rule.fingerprint.stableId?.value,
      semanticAttributes: rule.fingerprint.semanticAttributes.map(({ name, valueKind, value }) => ({ name, valueKind, value })),
      classNames: rule.fingerprint.stableClasses.map(({ className }) => className),
      normalizedTextHash: rule.fingerprint.normalizedTextHash?.hash,
      ancestorContext: rule.fingerprint.ancestorContext,
      structureContext: rule.fingerprint.structureContext,
      geometricHint: rule.fingerprint.geometricHint,
      cssSelectorMatched: false
    };
    const candidates = Array.from({ length: 10000 }, (_, index) => makeCandidate(index, target));
    const originalIds = candidates.map(({ candidateId }) => candidateId);

    const first = rankCandidates({ rule, candidates, minCategoryContribution: MIN_CATEGORY_CONTRIBUTION });
    const second = rankCandidates({ rule, candidates, minCategoryContribution: MIN_CATEGORY_CONTRIBUTION });

    expect(candidates.map(({ candidateId }) => candidateId)).toEqual(originalIds);
    expect(first.c1?.candidateId).toBe('candidate-9999');
    expect(first.c1?.totalScore).toBe(second.c1?.totalScore);
    expect(first.c1?.independentContributions).toBe(second.c1?.independentContributions);
    expect(first.c2?.candidateId).toBe(second.c2?.candidateId);
  });
});
