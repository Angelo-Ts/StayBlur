export type RuleStatus = 'active' | 'ambiguous' | 'notFound' | 'disabled';

export type MatchDecision = 'active' | 'ambiguous' | 'notFound';

export interface RuleStatusContext {
  domain: string;
  path?: string;
  evaluatedAt: string;
}
