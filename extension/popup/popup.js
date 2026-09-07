(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const status = text => {
    $('status').textContent = text || '';
    $('status').classList.toggle('error', Boolean(text && /errore|impossibile|non permette/i.test(text)));
  };
  async function send(type, extra = {}) { return chrome.runtime.sendMessage({ type, ...extra }); }

  const effectNames = {
    blur: 'Blur',
    strongBlur: 'Blur forte',
    pixelate: 'Pixelatura',
    blackout: 'Oscura',
    hide: 'Nascondi'
  };

  function renderRules(items = []) {
    const root = $('rules');
    root.replaceChildren();
    $('ruleCount').textContent = String(items.length);
    $('empty').hidden = items.length > 0;

    for (const rule of items) {
      const row = document.createElement('article');
      row.className = `rule${rule.enabled === false ? ' disabled' : ''}`;

      const head = document.createElement('div');
      head.className = 'rule-head';

      const info = document.createElement('div');
      info.className = 'rule-info';
      const name = document.createElement('div');
      name.className = 'rule-name';
      name.textContent = effectNames[rule.effect] || 'Oscuramento';
      const detail = document.createElement('div');
      detail.className = 'rule-detail';
      detail.textContent = `${rule.effect === 'blur' ? `Intensità ${rule.intensity ?? 60}%` : 'Elemento oscurato'}`;
      info.append(name, detail);

      const badge = document.createElement('span');
      badge.className = `rule-status${rule.enabled === false ? ' disabled' : ''}`;
      badge.textContent = rule.enabled === false ? 'Disattivata' : 'Attiva';
      head.append(info, badge);

      const actions = document.createElement('div');
      actions.className = 'rule-actions';

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Togli dalla pagina';
      remove.title = 'Toglie temporaneamente questo effetto dalla pagina corrente. La regola resta salvata.';
      remove.onclick = async () => {
        const r = await send('POPUP_REMOVE_BLUR_PAGE_ONLY', { ruleId: rule.ruleId });
        if (r?.ok) status('Effetto tolto dalla pagina. La regola resta salvata.');
        else status(r?.error || 'Impossibile togliere l’effetto.');
      };

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'delete';
      del.textContent = 'Elimina';
      del.title = 'Elimina definitivamente questa regola.';
      del.onclick = async () => {
        if (!confirm('Eliminare definitivamente questo oscuramento?')) return;
        const r = await send('POPUP_DELETE_RULE', { ruleId: rule.ruleId });
        if (r?.ok) { status('Oscuramento eliminato.'); await refresh(); }
        else status(r?.error || 'Impossibile eliminare l’oscuramento.');
      };

      actions.append(remove, del);
      row.append(head, actions);
      root.appendChild(row);
    }
  }

  async function refresh() {
    const r = await send('POPUP_GET_STATE');
    if (!r?.ok) return status(r?.error || 'Impossibile leggere lo stato della pagina.');
    $('enabled').checked = r.extensionEnabled !== false;
    renderRules(r.rules);
  }

  $('close').onclick = () => window.close();
  $('enabled').onchange = async e => {
    const r = await send('POPUP_SET_EXTENSION_ENABLED', { enabled: e.target.checked });
    if (!r?.ok) status(r?.error || 'Impossibile modificare lo stato.');
    else { status(e.target.checked ? 'Estensione attivata.' : 'Estensione disattivata.'); await refresh(); }
  };
  $('select').onclick = async () => {
    const r = await send('POPUP_START_SELECTION');
    if (r?.ok) status('Selezione attiva: passa sulla pagina e clicca l’elemento da oscurare. Premi Esc per annullare.');
    else status(r?.error || 'Impossibile avviare la selezione.');
  };
  $('removeAll').onclick = async () => {
    const r = await send('POPUP_REMOVE_ALL_EFFECTS_PAGE');
    if (r?.ok) { status('Tutti gli effetti sono stati tolti dalla pagina. Le regole restano salvate.'); await refresh(); }
    else status(r?.error || 'Impossibile togliere gli effetti.');
  };
  $('deleteAll').onclick = async () => {
    if (!confirm('Eliminare TUTTI gli oscuramenti salvati? Questa operazione non può essere annullata.')) return;
    const r = await send('POPUP_DELETE_ALL_RULES');
    if (r?.ok) { status('Tutti gli oscuramenti sono stati eliminati.'); await refresh(); }
    else status(r?.error || 'Impossibile eliminare gli oscuramenti.');
  };

  refresh();
})();
