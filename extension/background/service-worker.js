(() => {
  'use strict';

  const SETTINGS_KEY = 'pb:settings';
  const CONTENT_SCRIPTS = [
    'content/selection-style.js',
    'content/content-script.js',
    'content/reapply-runtime.js',
    'content/cleanup-runtime.js',
    'content/disabled-all-guard.js',
    'content/focus-overlay.js',
    'content/shadow-style.js'
  ];
  const map = {
    POPUP_GET_STATE: 'CONTENT_GET_STATE',
    POPUP_START_SELECTION: 'BG_ENTER_SELECTION',
    POPUP_STOP_SELECTION: 'BG_EXIT_SELECTION',
    POPUP_RETRY_RULE: 'BG_RETRY_RULE_ON_PAGE',
    POPUP_REMOVE_BLUR_PAGE_ONLY: 'BG_REMOVE_RULE_EFFECT_PAGE',
    POPUP_REMOVE_ALL_EFFECTS_PAGE: 'BG_REMOVE_ALL_EFFECTS_PAGE'
  };
  const FOCUS_SOURCE = 'stayblur-focus-rule';

  chrome.runtime.onInstalled.addListener(async () => {
    const state = await chrome.storage.local.get({ [SETTINGS_KEY]: null });
    if (!state[SETTINGS_KEY]) await chrome.storage.local.set({ [SETTINGS_KEY]: { extensionEnabled: true } });
  });

  async function activeTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  function pageBlockedMessage(text) {
    return /cannot access contents|extensions gallery|chrome:\/\//i.test(text)
      ? 'Questa pagina non permette a StayBlur di accedere al contenuto. Prova su una normale pagina web (http/https).'
      : text;
  }

  async function injectContent(tabId) {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: CONTENT_SCRIPTS });
  }

  async function pingContent(tabId) {
    try { return await chrome.tabs.sendMessage(tabId, { type: 'CONTENT_GET_STATE' }); }
    catch (_) { return null; }
  }

  async function sendToContent(tabId, message) {
    const first = await pingContent(tabId);
    if (first?.ok) return chrome.tabs.sendMessage(tabId, message);
    await new Promise(resolve => setTimeout(resolve, 80));
    const second = await pingContent(tabId);
    if (second?.ok) return chrome.tabs.sendMessage(tabId, message);
    try {
      await injectContent(tabId);
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (injectError) {
      throw new Error(pageBlockedMessage(String(injectError?.message || injectError)));
    }
  }

  async function focusRuleOnPage(tabId, ruleId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: (source, id) => window.postMessage({ source, ruleId: id }, '*'),
        args: [FOCUS_SOURCE, ruleId]
      });
      return { ok: true, result: true };
    } catch (error) {
      throw new Error(pageBlockedMessage(String(error?.message || error)));
    }
  }

  async function cleanupDom(tabId, ruleId = null) {
    if (!tabId) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: id => {
          const effects = ['blur', 'strongBlur', 'pixelate', 'blackout', 'hide'];
          const remove = element => {
            if (!(element instanceof Element)) return;
            element.classList.remove('pb-effect-base', ...effects.map(effect => `pb-effect-${effect}`));
            element.style.removeProperty('--pb-blur');
            element.style.removeProperty('--pb-strong-blur');
            if (!id || element.getAttribute('data-progettoblur-rule-id') === String(id)) {
              element.removeAttribute('data-progettoblur-rule-id');
            }
          };
          const selector = id ? `[data-progettoblur-rule-id="${CSS.escape(String(id))}"]` : '[data-progettoblur-rule-id]';
          for (const element of document.querySelectorAll(selector)) remove(element);
          for (const effect of effects) {
            for (const element of document.querySelectorAll(`.pb-effect-${effect}`)) {
              if (!id || element.getAttribute('data-progettoblur-rule-id') === String(id)) remove(element);
            }
          }
          for (const element of document.querySelectorAll('.pb-selection-highlight, .pb-rule-focus')) {
            element.classList.remove('pb-selection-highlight', 'pb-rule-focus');
          }
          document.getElementById('stayblur-rule-focus-overlay')?.remove();
        },
        args: [ruleId]
      });
    } catch (_) {}
  }

  async function setExtensionEnabled(enabled) {
    const stored = await chrome.storage.local.get({ [SETTINGS_KEY]: {} });
    const current = stored[SETTINGS_KEY] || {};
    await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, extensionEnabled: Boolean(enabled) } });
  }

  async function getRule(ruleId) {
    const key = `rule:${ruleId}`;
    const stored = await chrome.storage.local.get({ [key]: null });
    return stored[key] || null;
  }

  async function setRuleEnabled(ruleId, enabled) {
    const rule = await getRule(ruleId);
    if (!rule) return null;
    const updated = { ...rule, enabled: Boolean(enabled), status: enabled ? 'pending' : 'disabled', updatedAt: new Date().toISOString() };
    await chrome.storage.local.set({ [`rule:${ruleId}`]: updated });
    return updated;
  }

  async function setAllRulesEnabled(enabled) {
    const state = await chrome.storage.local.get(null);
    const rules = Object.entries(state).filter(([key, value]) => key.startsWith('rule:') && value && typeof value === 'object');
    if (!rules.length) return [];
    const now = new Date().toISOString();
    const updates = {};
    for (const [key, rule] of rules) {
      updates[key] = { ...rule, enabled: Boolean(enabled), status: enabled ? 'pending' : 'disabled', updatedAt: now };
    }
    await chrome.storage.local.set(updates);
    return rules.map(([, rule]) => rule.ruleId).filter(Boolean);
  }

  async function getEnabledRuleIds() {
    const state = await chrome.storage.local.get(null);
    return Object.entries(state)
      .filter(([key, value]) => key.startsWith('rule:') && value && typeof value === 'object' && value.enabled !== false)
      .map(([, rule]) => rule.ruleId)
      .filter(Boolean);
  }

  async function syncPageAfterExtensionToggle(tabId, enabled) {
    if (!tabId) return;
    if (!enabled) {
      try { await sendToContent(tabId, { type: 'BG_EXIT_SELECTION' }); } catch (_) {}
      try { await sendToContent(tabId, { type: 'BG_REMOVE_ALL_EFFECTS_PAGE' }); } catch (_) {}
      await cleanupDom(tabId);
      return;
    }
    for (const ruleId of await getEnabledRuleIds()) {
      try { await sendToContent(tabId, { type: 'BG_RETRY_RULE_ON_PAGE', ruleId }); } catch (_) {}
    }
  }

  async function deleteRule(ruleId) {
    const key = `rule:${ruleId}`;
    const stored = await chrome.storage.local.get({ [key]: null });
    const rule = stored[key];
    if (!rule) return;
    const domainKey = `idx:domain:${rule.domain}`;
    const pageKey = `idx:page:${rule.domain}:${rule.path || '/'}`;
    const indexes = await chrome.storage.local.get({ [domainKey]: [], [pageKey]: [] });
    await chrome.storage.local.set({
      [domainKey]: (indexes[domainKey] || []).filter(id => id !== ruleId),
      [pageKey]: (indexes[pageKey] || []).filter(id => id !== ruleId)
    });
    await chrome.storage.local.remove(key);
  }

  async function deleteAllRules() {
    const state = await chrome.storage.local.get(null);
    const keys = Object.keys(state).filter(key => key.startsWith('rule:') || key.startsWith('idx:'));
    if (keys.length) await chrome.storage.local.remove(keys);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      if (!message?.type) return sendResponse({ ok: false, error: 'missing-message-type' });
      if (message.type === 'POPUP_SET_EXTENSION_ENABLED') {
        const enabled = Boolean(message.enabled);
        const tab = sender.tab || await activeTab();
        await setExtensionEnabled(enabled);
        await syncPageAfterExtensionToggle(tab?.id, enabled);
        return sendResponse({ ok: true, extensionEnabled: enabled });
      }
      if (message.type === 'POPUP_START_SELECTION') {
        const tab = sender.tab || await activeTab();
        if (!tab?.id) return sendResponse({ ok: false, error: 'no-active-tab' });
        await setExtensionEnabled(true);
        return sendResponse(await sendToContent(tab.id, { type: 'BG_ENTER_SELECTION' }));
      }
      if (message.type === 'POPUP_STOP_SELECTION') {
        const tab = sender.tab || await activeTab();
        if (!tab?.id) return sendResponse({ ok: false, error: 'no-active-tab' });
        return sendResponse(await sendToContent(tab.id, { type: 'BG_EXIT_SELECTION' }));
      }
      if (message.type === 'POPUP_FOCUS_RULE') {
        const tab = sender.tab || await activeTab();
        if (!tab?.id) return sendResponse({ ok: false, error: 'no-active-tab' });
        return sendResponse(await focusRuleOnPage(tab.id, message.ruleId));
      }
      if (message.type === 'POPUP_DISABLE_ALL_RULES' || message.type === 'POPUP_ENABLE_ALL_RULES') {
        const enabled = message.type === 'POPUP_ENABLE_ALL_RULES';
        const ruleIds = await setAllRulesEnabled(enabled);
        const tab = sender.tab || await activeTab();
        if (tab?.id) {
          try {
            if (enabled) {
              for (const ruleId of ruleIds) await sendToContent(tab.id, { type: 'BG_RETRY_RULE_ON_PAGE', ruleId });
            } else {
              await sendToContent(tab.id, { type: 'BG_REMOVE_ALL_EFFECTS_PAGE' });
              await cleanupDom(tab.id);
            }
          } catch (_) {
            if (!enabled) await cleanupDom(tab.id);
          }
        }
        return sendResponse({ ok: true, count: ruleIds.length });
      }
      if (message.type === 'POPUP_DISABLE_RULE' || message.type === 'POPUP_ENABLE_RULE') {
        const enabled = message.type === 'POPUP_ENABLE_RULE';
        const updated = await setRuleEnabled(message.ruleId, enabled);
        if (!updated) return sendResponse({ ok: false, error: 'rule-not-found' });
        const tab = sender.tab || await activeTab();
        if (tab?.id) {
          try {
            await sendToContent(tab.id, enabled ? { type: 'BG_RETRY_RULE_ON_PAGE', ruleId: message.ruleId } : { type: 'BG_REMOVE_RULE_EFFECT_PAGE', ruleId: message.ruleId });
          } catch (_) {}
          if (!enabled) await cleanupDom(tab.id, message.ruleId);
        }
        return sendResponse({ ok: true, rule: updated });
      }
      if (message.type === 'POPUP_DELETE_RULE') {
        const tab = sender.tab || await activeTab();
        if (tab?.id) {
          try { await sendToContent(tab.id, { type: 'BG_REMOVE_RULE_EFFECT_PAGE', ruleId: message.ruleId }); } catch (_) {}
          await cleanupDom(tab.id, message.ruleId);
        }
        await deleteRule(message.ruleId);
        return sendResponse({ ok: true });
      }
      if (message.type === 'POPUP_DELETE_ALL_RULES') {
        const tab = sender.tab || await activeTab();
        if (tab?.id) {
          try { await sendToContent(tab.id, { type: 'BG_REMOVE_ALL_EFFECTS_PAGE' }); } catch (_) {}
          await cleanupDom(tab.id);
        }
        await deleteAllRules();
        return sendResponse({ ok: true });
      }
      const tab = sender.tab || await activeTab();
      if (!tab?.id) return sendResponse({ ok: false, error: 'no-active-tab' });
      const type = map[message.type] || message.type;
      const response = await sendToContent(tab.id, { ...message, type });
      sendResponse(response || { ok: true });
    })().catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });
})();
