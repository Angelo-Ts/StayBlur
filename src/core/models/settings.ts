import type { EffectType, RuleScope } from './rule.js';

export interface ExtensionSettings {
  extensionEnabled: boolean;
  defaultEffect: EffectType;
  defaultIntensity: number;
  defaultScope: RuleScope;
  selectionMode: {
    active: boolean;
    showIndicator: boolean;
  };
  matcherPolicy: {
    autoApplyThreshold: 0.85;
    ambiguousThreshold: 0.6;
    topGapAmbiguousDelta: 0.05;
    minIndependentCategories: 3;
    minCategoryContribution: number;
  };
  retryPolicy: {
    mutationDebounceMs: 150;
    inactivityWindowMs: 5000;
    maxAutoRetryAttemptsPerRulePerLoad: number;
  };
  ui: {
    showAmbiguousCandidatesV1: boolean;
  };
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  extensionEnabled: true,
  defaultEffect: 'blur',
  defaultIntensity: 60,
  defaultScope: 'page',
  selectionMode: {
    active: false,
    showIndicator: true
  },
  matcherPolicy: {
    autoApplyThreshold: 0.85,
    ambiguousThreshold: 0.6,
    topGapAmbiguousDelta: 0.05,
    minIndependentCategories: 3,
    minCategoryContribution: 0.65
  },
  retryPolicy: {
    mutationDebounceMs: 150,
    inactivityWindowMs: 5000,
    maxAutoRetryAttemptsPerRulePerLoad: 5
  },
  ui: {
    showAmbiguousCandidatesV1: false
  }
};
