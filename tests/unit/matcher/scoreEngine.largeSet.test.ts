import { describe, expect, it } from 'vitest';

import { rankCandidates } from '../../../src/core/matcher/scoreEngine.js';
import type { CandidateSnapshot } from '../../../src/core/matcher/scoringTypes.js';
import { sampleRule } from '../helpers/sampleRule.js';

const makeCandidate = (index: number): CandidateSnapshot => ({
  candidateId: `candidate-${index}`,
  tagName: index === 1737 ? 'section' : 'div',
  id: index === 1737 ? 'settings-panel' : undefined,
  semanticAttributes: index === 1737
    ? [{ name: 'role', valueKind: 'structural', value: 'region' }]
    : [{ name: 'role', valueKind: 'structural', value: 'generic' }],
  classNames: index === 1737 ? ['panel', 'secure'] : ['card'],
  normalizedTextHash: index === 1737 ? 'b'.repeat(64) : 'c'.repeat(64),
  ancestorContext: {
    chain: index === 1737
      ? [{ tag: 'main', semanticAttrs: [{ name: 'role', valueKind: 'structural', value: 'main' }], stableClasses: ['layout'] }]
      : [{ tag: 'main', semanticAttrs: [{ name: 'role', valueKind: 'structural', value: 'main' }], stableClasses: ['other'] }],
    depthCaptured: 1
  },
  structureContext: {
    siblingSignature: { previousTag: 'h2', nextTag: 'button', indexWithinStableParent: index === 1737 ? 2 : index % 5 },
    childSignature: { stableChildTagsTopK: ['h3', 'p'], stableChildRolesTopK: ['heading'] }
  },
  geometricHint: { viewportXRatio: 0.5, viewportYRatio: 0.4, widthRatio: 0.5, heightRatio: 0.2 },
  cssSelectorMatched: index === 1737
});

describe('matcher scoring on large candidate sets', () => {
  it('ranks a strong candidate deterministically without mutating the input set', () => {
    const candidates = Array.from({ length: 2000 }, (_, index) => makeCandidate(index));
    const originalIds = candidates.map((candidate) => candidate.candidateId);

    const first = rankCandidates({ rule: sampleRule(), candidates, minCategoryContribution: 0.65 });
    const second = rankCandidates({ rule: sampleRule(), candidates, minCategoryContribution: 0.65 });

    expect(first.c1?.candidateId).toBe('candidate-1737');
    expect(first.c1?.totalScore).toBeGreaterThan(0.85);
    expect(first.sorted).toHaveLength(2000);
    expect(second.sorted.map((candidate) => candidate.candidateId)).toEqual(first.sorted.map((candidate) => candidate.candidateId));
    expect(candidates.map((candidate) => candidate.candidateId)).toEqual(originalIds);
  });
});
