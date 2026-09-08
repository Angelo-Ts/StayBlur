import type { Rule } from '../models/rule.js';
import type { RuleStatusContext } from '../models/states.js';
import type { CandidateScore, RankedCandidates } from './scoringTypes.js';

export interface DecisionPolicy {
  autoApplyThreshold: number;
  ambiguousThreshold: number;
  topGapAmbiguousDelta: number;
  minIndependentCategories: number;
}

export interface MatchDecisionResult {
  status: Rule['status'];
  selectedCandidate?: CandidateScore;
  confidence: number;
  reason:
    | 'rule-disabled'
    | 'no-candidate'
    | 'below-ambiguous-threshold'
    | 'between-thresholds'
    | 'insufficient-independent-categories'
    | 'top-candidates-too-close'
    | 'safe-auto-apply';
}

const defaultScore = (candidate?: CandidateScore): number => candidate?.totalScore ?? 0;

export const decideMatch = (
  rule: Rule,
  ranked: RankedCandidates,
  policy: DecisionPolicy
): MatchDecisionResult => {
  if (!rule.enabled) {
    return {
      status: 'disabled',
      confidence: 0,
      reason: 'rule-disabled'
    };
  }

  const c1 = ranked.c1;
  const c2 = ranked.c2;

  if (!c1) {
    return {
      status: 'notFound',
      confidence: 0,
      reason: 'no-candidate'
    };
  }

  const c1Score = defaultScore(c1);
  const c2Score = defaultScore(c2);

  if (c1Score < policy.ambiguousThreshold) {
    return {
      status: 'notFound',
      selectedCandidate: c1,
      confidence: c1Score,
      reason: 'below-ambiguous-threshold'
    };
  }

  if (c1Score < policy.autoApplyThreshold) {
    return {
      status: 'ambiguous',
      selectedCandidate: c1,
      confidence: c1Score,
      reason: 'between-thresholds'
    };
  }

  if (c1.independentContributions < policy.minIndependentCategories) {
    return {
      status: 'ambiguous',
      selectedCandidate: c1,
      confidence: c1Score,
      reason: 'insufficient-independent-categories'
    };
  }

  if (Math.abs(c1Score - c2Score) <= policy.topGapAmbiguousDelta) {
    return {
      status: 'ambiguous',
      selectedCandidate: c1,
      confidence: c1Score,
      reason: 'top-candidates-too-close'
    };
  }

  return {
    status: 'active',
    selectedCandidate: c1,
    confidence: c1Score,
    reason: 'safe-auto-apply'
  };
};

export const withStatusContext = (
  rule: Rule,
  status: Rule['status'],
  context: RuleStatusContext,
  confidence?: number
): Rule => ({
  ...rule,
  status,
  statusContext: context,
  lastConfidence: confidence,
  lastMatchedAt: status === 'active' ? context.evaluatedAt : rule.lastMatchedAt,
  updatedAt: context.evaluatedAt
});
