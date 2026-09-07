import type { Fingerprint } from './fingerprint.js';
import type { RuleStatus, RuleStatusContext } from './states.js';

export type RuleScope = 'page' | 'site';

export type EffectType = 'blur' | 'strongBlur' | 'pixelate' | 'blackout' | 'hide';

export interface RetryMeta {
  autoRetryAttemptsCurrentLoad: number;
  lastRetryAt?: string;
  retryWindowClosedAt?: string;
}

export interface Rule {
  ruleId: string;
  scope: RuleScope;
  domain: string;
  path?: string;
  url?: string;
  /** Identifies the document/frame where the rule was created. Optional for backward compatibility. */
  frameKey?: string;
  enabled: boolean;
  status: RuleStatus;
  statusContext?: RuleStatusContext;
  effect: EffectType;
  intensity: number;
  createdAt: string;
  updatedAt: string;
  lastMatchedAt?: string;
  lastConfidence?: number;
  fingerprint: Fingerprint;
  retryMeta?: RetryMeta;
}
