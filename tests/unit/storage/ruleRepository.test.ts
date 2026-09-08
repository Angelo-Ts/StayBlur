import { describe, expect, it } from 'vitest';

import { InMemoryStorageArea } from '../../../src/core/storage/storageArea.js';
import { RuleRepository } from '../../../src/core/storage/ruleRepository.js';
import { sampleRule } from '../helpers/sampleRule.js';

describe('RuleRepository + IndexRepository', () => {
  it('retrieves page and site rules via indexes without full scans', async () => {
    const storage = new InMemoryStorageArea();
    const repository = new RuleRepository(storage);

    const pageRule = sampleRule();
    const siteRule = { ...sampleRule(), ruleId: 'rule-2', scope: 'site' as const, path: undefined };

    await repository.save(pageRule);
    await repository.save(siteRule);

    const loaded = await repository.getForPage('example.com', '/settings');

    expect(loaded.map((rule) => rule.ruleId).sort()).toEqual(['rule-1', 'rule-2']);
  });

  it('updates runtime status as current-page state context, not permanent validity', async () => {
    const storage = new InMemoryStorageArea();
    const repository = new RuleRepository(storage);

    const rule = sampleRule();
    await repository.save(rule);

    const updated = await repository.setRuntimeStatus(
      rule.ruleId,
      'ambiguous',
      {
        domain: 'example.com',
        path: '/settings',
        evaluatedAt: '2026-01-03T00:00:00.000Z'
      },
      0.72
    );

    expect(updated?.status).toBe('ambiguous');
    expect(updated?.enabled).toBe(true);
    expect(updated?.statusContext?.path).toBe('/settings');
  });

  it('removes rules from storage and indexes on delete', async () => {
    const storage = new InMemoryStorageArea();
    const repository = new RuleRepository(storage);

    const rule = sampleRule();
    await repository.save(rule);

    await repository.delete(rule.ruleId);

    const loaded = await repository.getForPage('example.com', '/settings');
    expect(loaded).toEqual([]);
    expect(await repository.get(rule.ruleId)).toBeUndefined();
  });
});
