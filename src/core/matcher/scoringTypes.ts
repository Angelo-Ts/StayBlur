import type { Fingerprint } from '../models/fingerprint.js';
import type { Rule } from '../models/rule.js';

export type IndependentCategory =
  | 'stableId'
  | 'semanticAttributes'
  | 'textHash'
  | 'stableClasses'
  | 'ancestorContext'
  | 'structureContext';

export type SupportCategory = 'cssSelector' | 'geometry' | 'tagName';

export type Category = IndependentCategory | SupportCategory;

export interface CandidateSnapshot {
  candidateId: string;
  tagName: string;
  id?: string;
  semanticAttributes: Array<{ name: string; valueKind: 'hash' | 'structural'; value: string }>;
  classNames: string[];
  normalizedTextHash?: string;
  ancestorContext: Fingerprint['ancestorContext'];
  structureContext: Fingerprint['structureContext'];
  geometricHint?: Fingerprint['geometricHint'];
  cssSelectorMatched: boolean;
}

export interface CategoryBreakdown {
  score: number;
  available: boolean;
}

export interface CandidateScore {
  candidateId: string;
  totalScore: number;
  independentContributions: number;
  breakdown: Record<Category, CategoryBreakdown>;
}

export interface RankedCandidates {
  sorted: CandidateScore[];
  c1?: CandidateScore;
  c2?: CandidateScore;
}

export interface ScoringInput {
  rule: Rule;
  candidates: CandidateSnapshot[];
  minCategoryContribution: number;
}
