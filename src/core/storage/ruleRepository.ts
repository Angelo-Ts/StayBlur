import type { Rule } from '../models/rule.js';
import { withStatusContext } from '../matcher/decisionEngine.js';
import type { RuleStatusContext } from '../models/states.js';
import type { StorageAreaLike } from './storageArea.js';
import { ruleKey } from './storageKeys.js';
import { IndexRepository } from './indexRepository.js';

export class RuleRepository {
  private readonly indexes: IndexRepository;

  constructor(private readonly storage: StorageAreaLike) {
    this.indexes = new IndexRepository(storage);
  }

  async save(rule: Rule): Promise<void> {
    await this.storage.set({ [ruleKey(rule.ruleId)]: rule });
    await this.indexes.addRule(rule);
  }

  async get(ruleId: string): Promise<Rule | undefined> {
    const key = ruleKey(ruleId);
    const result = await this.storage.get<Record<string, Rule | undefined>>({ [key]: undefined });
    return result[key];
  }

  async getForPage(domain: string, path: string): Promise<Rule[]> {
    const ids = await this.indexes.getRuleIdsForPage(domain, path);
    if (ids.length === 0) {
      return [];
    }

    const keys = ids.map((id) => ruleKey(id));
    const result = await this.storage.get<Record<string, Rule | undefined>>(keys);

    return ids
      .map((id) => result[ruleKey(id)])
      .filter((rule): rule is Rule => Boolean(rule));
  }

  async delete(ruleId: string): Promise<void> {
    const existing = await this.get(ruleId);
    if (!existing) {
      return;
    }

    await this.storage.remove(ruleKey(ruleId));
    await this.indexes.removeRule(existing);
  }

  async setRuntimeStatus(
    ruleId: string,
    status: Rule['status'],
    context: RuleStatusContext,
    confidence?: number
  ): Promise<Rule | undefined> {
    const existing = await this.get(ruleId);
    if (!existing) {
      return undefined;
    }

    const updated = withStatusContext(existing, status, context, confidence);
    await this.save(updated);
    return updated;
  }
}
