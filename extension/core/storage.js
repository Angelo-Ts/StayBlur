import { SETTINGS_DEFAULT, SETTINGS_KEY } from './constants.js';

const KEY_PREFIX = {
  RULE: 'rule:',
  DOMAIN: 'idx:domain:',
  PAGE: 'idx:page:'
};

const ruleKey = (ruleId) => `${KEY_PREFIX.RULE}${ruleId}`;
const domainKey = (domain) => `${KEY_PREFIX.DOMAIN}${domain}`;
const pageKey = (domain, path) => `${KEY_PREFIX.PAGE}${domain}:${path}`;

const unique = (items) => [...new Set(items)];

export class ChromeStorageAdapter {
  constructor(area = chrome.storage.local) {
    this.area = area;
  }

  async get(defaultsOrKeys) {
    return this.area.get(defaultsOrKeys);
  }

  async set(items) {
    await this.area.set(items);
  }

  async remove(keys) {
    await this.area.remove(keys);
  }
}

export class RuleStore {
  constructor(storage = new ChromeStorageAdapter()) {
    this.storage = storage;
  }

  async saveRule(rule) {
    const domainIndexKey = domainKey(rule.domain);
    const currentDomain = await this.storage.get({ [domainIndexKey]: [] });

    const updates = {
      [ruleKey(rule.ruleId)]: rule,
      [domainIndexKey]: unique([...(currentDomain[domainIndexKey] ?? []), rule.ruleId])
    };

    if (rule.scope === 'page' && rule.path) {
      const pageIndexKey = pageKey(rule.domain, rule.path);
      const currentPage = await this.storage.get({ [pageIndexKey]: [] });
      updates[pageIndexKey] = unique([...(currentPage[pageIndexKey] ?? []), rule.ruleId]);
    }

    await this.storage.set(updates);
    return rule;
  }

  async getRule(ruleId) {
    const key = ruleKey(ruleId);
    const result = await this.storage.get({ [key]: undefined });
    return result[key];
  }

  async getRulesForPage(domain, path) {
    const dKey = domainKey(domain);
    const pKey = pageKey(domain, path);
    const indexes = await this.storage.get({ [dKey]: [], [pKey]: [] });
    const ids = unique([...(indexes[dKey] ?? []), ...(indexes[pKey] ?? [])]);

    if (ids.length === 0) return [];

    const keys = ids.map((id) => ruleKey(id));
    const loaded = await this.storage.get(keys);

    return ids.map((id) => loaded[ruleKey(id)]).filter(Boolean);
  }

  async setRuleEnabled(ruleId, enabled) {
    const existing = await this.getRule(ruleId);
    if (!existing) return undefined;

    const updated = {
      ...existing,
      enabled,
      status: enabled ? existing.status : 'disabled',
      updatedAt: new Date().toISOString()
    };

    await this.saveRule(updated);
    return updated;
  }

  async setRuleStatus(ruleId, status, statusContext, confidence) {
    const existing = await this.getRule(ruleId);
    if (!existing) return undefined;

    const evaluatedAt = statusContext?.evaluatedAt ?? new Date().toISOString();

    const updated = {
      ...existing,
      status,
      statusContext: {
        domain: statusContext?.domain ?? existing.domain,
        path: statusContext?.path,
        evaluatedAt
      },
      lastConfidence: confidence,
      lastMatchedAt: status === 'active' ? evaluatedAt : existing.lastMatchedAt,
      updatedAt: evaluatedAt
    };

    await this.saveRule(updated);
    return updated;
  }

  async setSettings(nextPartialSettings) {
    const existing = await this.getSettings();
    const updated = {
      ...existing,
      ...nextPartialSettings
    };

    await this.storage.set({ [SETTINGS_KEY]: updated });
    return updated;
  }

  async getSettings() {
    const result = await this.storage.get({ [SETTINGS_KEY]: SETTINGS_DEFAULT });
    return {
      ...SETTINGS_DEFAULT,
      ...(result[SETTINGS_KEY] ?? {})
    };
  }

  async deleteRule(ruleId) {
    const existing = await this.getRule(ruleId);
    if (!existing) return false;

    await this.storage.remove(ruleKey(ruleId));

    const dKey = domainKey(existing.domain);
    const dState = await this.storage.get({ [dKey]: [] });
    await this.storage.set({ [dKey]: (dState[dKey] ?? []).filter((id) => id !== ruleId) });

    if (existing.path) {
      const pKey = pageKey(existing.domain, existing.path);
      const pState = await this.storage.get({ [pKey]: [] });
      await this.storage.set({ [pKey]: (pState[pKey] ?? []).filter((id) => id !== ruleId) });
    }

    return true;
  }
}

export const pageContextFromUrl = (url) => {
  const parsed = new URL(url);
  return {
    domain: parsed.hostname,
    path: parsed.pathname || '/'
  };
};
