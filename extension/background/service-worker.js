(() => {
  'use strict';
  const SETTINGS_KEY = 'pb:settings';
  const CONTENT_SCRIPTS = ['content/selection-style.js', 'content/content-script.js', 'content/shadow-style.js'];

  const map = {
    POPUP_GET_STATE: 'CONTENT_GET_STATE',
    POPUP_START_SELECTION: 'BG_ENTER_SELECTION',
    POPUP_STOP_SELECTION: 'BG_EXIT_SELECTION',
    POPUP_RETRY_RULE: 'BG_RETRY_RULE_ON_PAGE',
    POPUP_REMOVE_BLUR_PAGE_ONLY: 'BG_REMOVE_RULE_EFFECT_PAGE',
    POPUP_REMOVE_ALL_EFFECTS_PAGE: 'BG_REMOVE_ALL_EFFECTS_PAGE'
  };

  chrome.runtime.onInstalled.addListener(async () => {
    const state = await chrome.storage.local.get({ [SETTINGS_KEY]: null });
    if (!state[SETTINGS_KEY]) await chrome.storage.local.set({ [SETTINGS_KEY]: { extensionEnabled: true } });
  });

  async function activeTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  function pageBlockedMessage(text) {
    return /cannot access contents|extensions gallery|chrome:\/\/|edge:\/\//i.test(text)
      ? 'Questa pagina non permette a progettoBlur di accedere al contenuto. Prova su una normale pagina web (http/https).'
      : text;
  }

  async function injectContent(tabId) {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: CONTENT_SCRIPTS });
  }

  async function sendToContent(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (firstError) {
      try {
        await injectContent(tabId);
        return await chrome.tabs.sendMessage(tabId, message);
      } catch (injectError) {
        const text = String(injectError?.message || firstError?.message || injectError);
        throw new Error(pageBlockedMessage(text));
      }
    }
  }

  async function startSelectionOnPage(tabId) {
    try {
      await injectContent(tabId);
      const invoked = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
          if (typeof globalThis.__progettoBlurStartSelection === 'function') {
            globalThis.__progettoBlurStartSelection();
            return true;
          }
          return false;
        }
      });
      if (invoked.some(r => r.result === true)) return { ok: true };
      return { ok: false, error: 'selection-script-not-available' };
    } catch (error) {
      const text = String(error?.message || error);
      throw new Error(pageBlockedMessage(text));
    }
  }

  async function setExtensionEnabled(enabled) {
    const stored = await chrome.storage.local.get({ [SETTINGS_KEY]: {} });
    const current = stored[SETTINGS_KEY] || {};
    await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, extensionEnabled: Boolean(enabled) } });
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
        await setExtensionEnabled(message.enabled);
        return sendResponse({ ok: true });
      }
      if (message.type === 'POPUP_START_SELECTION') {
        const tab = sender.tab || await activeTab();
        if (!tab?.id) return sendResponse({ ok: false, error: 'no-active-tab' });
        await setExtensionEnabled(true);
        return sendResponse(await startSelectionOnPage(tab.id));
      }
      if (message.type === 'POPUP_DELETE_RULE') {
        const tab = sender.tab || await activeTab();
        if (tab?.id) {
          try { await sendToContent(tab.id, { type: 'BG_REMOVE_RULE_EFFECT_PAGE', ruleId: message.ruleId }); } catch (_) {}
        }
        await deleteRule(message.ruleId);
        return sendResponse({ ok: true });
      }
      if (message.type === 'POPUP_DELETE_ALL_RULES') {
        const tab = sender.tab || await activeTab();
        if (tab?.id) {
          try { await sendToContent(tab.id, { type: 'BG_REMOVE_ALL_EFFECTS_PAGE' }); } catch (_) {}
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