import type { Rule } from '../models/rule.js';
import { domainIndexKey, pageIndexKey } from './storageKeys.js';
import type { StorageAreaLike } from './storageArea.js';

const unique = (ids: string[]): string[] => [...new Set(ids)];

export class IndexRepository {
  constructor(private readonly storage: StorageAreaLike) {}

  async addRule(rule: Rule): Promise<void> {
    const domainKey = domainIndexKey(rule.domain);
    const domainResult = await this.storage.get<Record<string, string[]>>({ [domainKey]: [] });
    const domainList = unique([...(domainResult[domainKey] ?? []), rule.ruleId]);

    const entries: Record<string, unknown> = {
      [domainKey]: domainList
    };

    if (rule.scope === 'page' && rule.path) {
      const pageKey = pageIndexKey(rule.domain, rule.path);
      const pageResult = await this.storage.get<Record<string, string[]>>({ [pageKey]: [] });
      entries[pageKey] = unique([...(pageResult[pageKey] ?? []), rule.ruleId]);
    }

    await this.storage.set(entries);
  }

  async removeRule(rule: Rule): Promise<void> {
    const domainKey = domainIndexKey(rule.domain);
    const domainResult = await this.storage.get<Record<string, string[]>>({ [domainKey]: [] });

    const entries: Record<string, unknown> = {
      [domainKey]: (domainResult[domainKey] ?? []).filter((id) => id !== rule.ruleId)
    };

    if (rule.path) {
      const pageKey = pageIndexKey(rule.domain, rule.path);
      const pageResult = await this.storage.get<Record<string, string[]>>({ [pageKey]: [] });
      entries[pageKey] = (pageResult[pageKey] ?? []).filter((id) => id !== rule.ruleId);
    }

    await this.storage.set(entries);
  }

  async getRuleIdsForPage(domain: string, path: string): Promise<string[]> {
    const domainKey = domainIndexKey(domain);
    const pageKey = pageIndexKey(domain, path);

    const result = await this.storage.get<Record<string, string[]>>({
      [domainKey]: [],
      [pageKey]: []
    });

    return unique([...(result[domainKey] ?? []), ...(result[pageKey] ?? [])]);
  }
}
