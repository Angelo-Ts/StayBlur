import type { Category, IndependentCategory } from './scoringTypes.js';

export const INDEPENDENT_CATEGORIES: readonly IndependentCategory[] = [
  'stableId',
  'semanticAttributes',
  'textHash',
  'stableClasses',
  'ancestorContext',
  'structureContext'
] as const;

export const SUPPORT_CATEGORIES: readonly Exclude<Category, IndependentCategory>[] = [
  'cssSelector',
  'geometry',
  'tagName'
] as const;
