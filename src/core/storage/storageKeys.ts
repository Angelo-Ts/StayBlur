export const STORAGE_KEYS = {
  rulePrefix: 'rule:',
  domainIndexPrefix: 'idx:domain:',
  pageIndexPrefix: 'idx:page:'
} as const;

export const ruleKey = (ruleId: string): string => `${STORAGE_KEYS.rulePrefix}${ruleId}`;
export const domainIndexKey = (domain: string): string => `${STORAGE_KEYS.domainIndexPrefix}${domain}`;
export const pageIndexKey = (domain: string, path: string): string =>
  `${STORAGE_KEYS.pageIndexPrefix}${domain}:${path}`;
