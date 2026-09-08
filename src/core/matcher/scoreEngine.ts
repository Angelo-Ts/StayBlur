import type { Fingerprint } from '../models/fingerprint.js';
import type { Category, CandidateScore, CandidateSnapshot, RankedCandidates, ScoringInput } from './scoringTypes.js';
import { INDEPENDENT_CATEGORIES } from './categories.js';

const WEIGHTS: Record<Category, number> = {
  stableId: 0.26,
  semanticAttributes: 0.22,
  textHash: 0.14,
  stableClasses: 0.12,
  ancestorContext: 0.1,
  structureContext: 0.08,
  cssSelector: 0.04,
  geometry: 0.02,
  tagName: 0.02
};

const clip01 = (value: number): number => Math.min(1, Math.max(0, value));
const safeDivide = (numerator: number, denominator: number): number => denominator === 0 ? 0 : numerator / denominator;

const jaccard = (a: string[], b: string[]): number => {
  if (a.length === 0 || b.length === 0) return 0;
  const [smaller, larger] = a.length <= b.length ? [a, b] : [b, a];
  const largerSet = new Set(larger);
  const smallerSet = new Set(smaller);
  let intersection = 0;
  for (const value of smallerSet) if (largerSet.has(value)) intersection += 1;
  const union = largerSet.size + smallerSet.size - intersection;
  return safeDivide(intersection, union);
};

const semanticMapCache = new WeakMap<object, Map<string, string>>();

const getSemanticMap = (owner: object, attributes: CandidateSnapshot['semanticAttributes']): Map<string, string> => {
  const cached = semanticMapCache.get(owner);
  if (cached) return cached;
  const map = new Map(attributes.map((attr) => [`${attr.name}:${attr.valueKind}`, attr.value]));
  semanticMapCache.set(owner, map);
  return map;
};

const scoreStableId = (fingerprint: Fingerprint, candidate: CandidateSnapshot) => {
  if (!fingerprint.stableId || !candidate.id) return { score: 0, available: false };
  return { score: candidate.id === fingerprint.stableId.value ? 1 : 0, available: true };
};

const scoreSemanticAttributes = (fingerprint: Fingerprint, candidate: CandidateSnapshot) => {
  if (fingerprint.semanticAttributes.length === 0 || candidate.semanticAttributes.length === 0) return { score: 0, available: false };
  const candidateMap = getSemanticMap(candidate, candidate.semanticAttributes);
  let numerator = 0;
  let denominator = 0;
  for (const attr of fingerprint.semanticAttributes) {
    denominator += attr.stabilityHint;
    const key = `${attr.name}:${attr.valueKind}`;
    if (candidateMap.get(key) === attr.value) numerator += attr.stabilityHint;
  }
  return { score: clip01(safeDivide(numerator, denominator)), available: denominator > 0 };
};

const scoreTextHash = (fingerprint: Fingerprint, candidate: CandidateSnapshot) => {
  if (!fingerprint.normalizedTextHash?.stable || !candidate.normalizedTextHash) return { score: 0, available: false };
  return { score: candidate.normalizedTextHash === fingerprint.normalizedTextHash.hash ? 1 : 0, available: true };
};

const scoreStableClasses = (fingerprint: Fingerprint, candidate: CandidateSnapshot) => {
  if (fingerprint.stableClasses.length === 0 || candidate.classNames.length === 0) return { score: 0, available: false };
  const base = fingerprint.stableClasses.map((entry) => entry.className);
  return { score: clip01(jaccard(base, candidate.classNames)), available: true };
};

const scoreAncestorNode = (
  fingerprintNode: Fingerprint['ancestorContext']['chain'][number],
  candidateNode?: Fingerprint['ancestorContext']['chain'][number]
): number => {
  if (!candidateNode) return 0;
  const tagScore = fingerprintNode.tag === candidateNode.tag ? 1 : 0;
  const attrScore = jaccard(
    fingerprintNode.semanticAttrs.map((attr) => `${attr.name}:${attr.valueKind}:${attr.value}`),
    candidateNode.semanticAttrs.map((attr) => `${attr.name}:${attr.valueKind}:${attr.value}`)
  );
  const classScore = jaccard(fingerprintNode.stableClasses, candidateNode.stableClasses);
  return clip01(0.5 * tagScore + 0.3 * attrScore + 0.2 * classScore);
};

const scoreAncestorContext = (fingerprint: Fingerprint, candidate: CandidateSnapshot) => {
  const reference = fingerprint.ancestorContext.chain;
  const compared = candidate.ancestorContext.chain;
  if (reference.length === 0 || compared.length === 0) return { score: 0, available: false };
  const alignedCount = Math.min(reference.length, compared.length);
  let total = 0;
  for (let index = 0; index < alignedCount; index += 1) total += scoreAncestorNode(reference[index], compared[index]);
  return { score: clip01(safeDivide(total, alignedCount)), available: true };
};

const scoreStructureContext = (fingerprint: Fingerprint, candidate: CandidateSnapshot) => {
  const fpSibling = fingerprint.structureContext.siblingSignature;
  const candidateSibling = candidate.structureContext.siblingSignature;
  const fpChild = fingerprint.structureContext.childSignature;
  const candidateChild = candidate.structureContext.childSignature;
  const checks: number[] = [];
  if (fpSibling && candidateSibling) {
    if (fpSibling.previousTag) checks.push(fpSibling.previousTag === candidateSibling.previousTag ? 1 : 0);
    if (fpSibling.nextTag) checks.push(fpSibling.nextTag === candidateSibling.nextTag ? 1 : 0);
    if (typeof fpSibling.indexWithinStableParent === 'number' && typeof candidateSibling.indexWithinStableParent === 'number') checks.push(fpSibling.indexWithinStableParent === candidateSibling.indexWithinStableParent ? 1 : 0);
  }
  if (fpChild && candidateChild) {
    checks.push(jaccard(fpChild.stableChildTagsTopK, candidateChild.stableChildTagsTopK));
    checks.push(jaccard(fpChild.stableChildRolesTopK, candidateChild.stableChildRolesTopK));
  }
  if (checks.length === 0) return { score: 0, available: false };
  return { score: clip01(checks.reduce((sum, score) => sum + score, 0) / checks.length), available: true };
};

const scoreCssSelector = (candidate: CandidateSnapshot) => ({ score: candidate.cssSelectorMatched ? 1 : 0, available: true });

const scoreGeometry = (fingerprint: Fingerprint, candidate: CandidateSnapshot) => {
  if (!fingerprint.geometricHint || !candidate.geometricHint) return { score: 0, available: false };
  const keys: Array<keyof NonNullable<Fingerprint['geometricHint']>> = ['viewportXRatio', 'viewportYRatio', 'widthRatio', 'heightRatio'];
  const deltaAverage = keys.reduce((sum, key) => sum + clip01(Math.abs(fingerprint.geometricHint![key] - candidate.geometricHint![key])), 0) / keys.length;
  return { score: clip01(1 - deltaAverage), available: true };
};

const scoreTagName = (fingerprint: Fingerprint, candidate: CandidateSnapshot) => ({ score: fingerprint.tagName === candidate.tagName ? 1 : 0, available: true });

export const scoreCandidate = (
  fingerprint: Fingerprint,
  candidate: CandidateSnapshot,
  minCategoryContribution: number
): CandidateScore => {
  const breakdown = {
    stableId: scoreStableId(fingerprint, candidate),
    semanticAttributes: scoreSemanticAttributes(fingerprint, candidate),
    textHash: scoreTextHash(fingerprint, candidate),
    stableClasses: scoreStableClasses(fingerprint, candidate),
    ancestorContext: scoreAncestorContext(fingerprint, candidate),
    structureContext: scoreStructureContext(fingerprint, candidate),
    cssSelector: scoreCssSelector(candidate),
    geometry: scoreGeometry(fingerprint, candidate),
    tagName: scoreTagName(fingerprint, candidate)
  };

  let weightedScoreSum = 0;
  let availableWeightSum = 0;
  for (const [category, result] of Object.entries(breakdown) as Array<[Category, { score: number; available: boolean }]>) {
    if (!result.available) continue;
    weightedScoreSum += WEIGHTS[category] * result.score;
    availableWeightSum += WEIGHTS[category];
  }

  const totalScore = availableWeightSum > 0 ? clip01(weightedScoreSum / availableWeightSum) : 0;
  const independentContributions = INDEPENDENT_CATEGORIES.filter((category) => {
    const signal = breakdown[category];
    return signal.available && signal.score >= minCategoryContribution;
  }).length;

  return { candidateId: candidate.candidateId, totalScore, independentContributions, breakdown };
};

const compareCandidateScore = (left: CandidateScore, right: CandidateScore): number => {
  if (left.totalScore !== right.totalScore) return right.totalScore - left.totalScore;
  if (left.independentContributions !== right.independentContributions) return right.independentContributions - left.independentContributions;
  const leftSemantic = left.breakdown.semanticAttributes.score;
  const rightSemantic = right.breakdown.semanticAttributes.score;
  if (leftSemantic !== rightSemantic) return rightSemantic - leftSemantic;
  if (left.candidateId === right.candidateId) return 0;
  return left.candidateId < right.candidateId ? -1 : 1;
};

export const rankCandidates = ({ rule, candidates, minCategoryContribution }: ScoringInput): RankedCandidates => {
  const scored = candidates.map((candidate) => scoreCandidate(rule.fingerprint, candidate, minCategoryContribution));
  const sorted = scored.sort(compareCandidateScore);
  return { sorted, c1: sorted[0], c2: sorted[1] };
};

export const CATEGORY_WEIGHTS = WEIGHTS;
export const INDEPENDENT_CATEGORY_SET = INDEPENDENT_CATEGORIES;
