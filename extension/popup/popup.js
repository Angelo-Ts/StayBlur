(() => {
  'use strict';
  const $=id=>document.getElementById(id),manifest=chrome.runtime.getManifest();
  document.title=manifest.name||'StayBlur';
  if($('version'))$('version').textContent=`v${manifest.version}`;
  if($('footerVersion'))$('footerVersion').textContent=`v${manifest.version}`;
  const status=text=>{$('status').textContent=text||'';$('status').classList.toggle('error',Boolean(text&&/errore|impossibile|non permette/i.test(text)))};
  async function send(type,extra={}){return chrome.runtime.sendMessage({type,...extra})}
  const effectNames={blur:'Blur',strongBlur:'Blur forte',pixelate:'Pixelatura',blackout:'Oscura',hide:'Nascondi'};
  function renderRules(items=[]){
    const root=$('rules');root.replaceChildren();$('ruleCount').textContent=String(items.length);$('empty').hidden=items.length>0;
    for(const rule of items){
      const row=document.createElement('article');row.className=`rule${rule.enabled===false?' disabled':''}`;row.title='Clicca per evidenziare il relativo elemento nella pagina';row.tabIndex=0;
      const head=document.createElement('div');head.className='rule-head';const info=document.createElement('div');info.className='rule-info';
      const name=document.createElement('div');name.className='rule-name';name.textContent=effectNames[rule.effect]||'Oscuramento';
      const detail=document.createElement('div');detail.className='rule-detail';detail.textContent=`${rule.effect==='blur'?`Intensità ${rule.intensity??60}%`:'Elemento oscurato'}`;
      info.append(name,detail);const badge=document.createElement('span');badge.className=`rule-status${rule.enabled===false?' disabled':''}`;badge.textContent=rule.enabled===false?'Disattivata':'Attiva';head.append(info,badge);
      const actions=document.createElement('div');actions.className='rule-actions';
      const toggle=document.createElement('button');toggle.type='button';toggle.textContent=rule.enabled===false?'Riabilita':'Disattiva';toggle.onclick=async e=>{e.stopPropagation();const type=rule.enabled===false?'POPUP_ENABLE_RULE':'POPUP_DISABLE_RULE',r=await send(type,{ruleId:rule.ruleId});if(r?.ok){status(rule.enabled===false?'Regola riabilitata.':'Regola disattivata.');await refresh()}else status(r?.error||'Impossibile modificare la regola.')};
      const del=document.createElement('button');del.type='button';del.className='delete';del.textContent='Elimina';del.onclick=async e=>{e.stopPropagation();if(!confirm('Eliminare definitivamente questo oscuramento?'))return;const r=await send('POPUP_DELETE_RULE',{ruleId:rule.ruleId});if(r?.ok){status('Oscuramento eliminato.');await refresh()}else status(r?.error||'Impossibile eliminare l’oscuramento.')};
      actions.append(toggle,del);row.append(head,actions);
      const focus=async()=>{const r=await send('POPUP_FOCUS_RULE',{ruleId:rule.ruleId});if(!r?.ok||r?.result===false)status('Non riesco a ritrovare questo elemento in modo sicuro.');else status('Elemento evidenziato nella pagina.')};
      row.onclick=focus;row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focus()}};root.appendChild(row);
    }
  }
  async function saveSelectionPreferences(){const effect=$('effect').value,intensity=Math.max(0,Math.min(100,Number($('intensity').value)||0)),stored=await chrome.storage.local.get({'pb:settings':{extensionEnabled:$('enabled').checked}}),current=stored['pb:settings']||{};await chrome.storage.local.set({'pb:settings':{...current,extensionEnabled:$('enabled').checked,selectionEffect:effect,selectionIntensity:intensity}});$('intensityValue').textContent=`${intensity}%`}
  async function refresh(){
    const[r,stored]=await Promise.all([send('POPUP_GET_STATE'),chrome.storage.local.get({'pb:settings':{extensionEnabled:true,selectionEffect:'blur',selectionIntensity:60}})];
    if(!r?.ok)return status(r?.error||'Impossibile leggere lo stato della pagina.');
    const settings=stored['pb:settings']||{};$('enabled').checked=r.extensionEnabled!==false;$('effect').value=settings.selectionEffect||'blur';$('intensity').value=String(settings.selectionIntensity??60);$('intensityValue').textContent=`${$('intensity').value}%`;renderRules(r.rules);
    const rules=r.rules||[],allDisabled=rules.length>0&&rules.every(rule=>rule.enabled===false),toggleAll=$('toggleAll');if(toggleAll){toggleAll.disabled=rules.length===0;toggleAll.textContent=allDisabled?'Riabilita tutti gli oscuramenti':'Disattiva tutti gli oscuramenti'}
    const select=$('select');if(select){select.textContent='Seleziona elementi';select.classList.remove('active');select.setAttribute('aria-pressed','false');select.disabled=r.selectionActive===true}
    const help=$('selectionHelp');if(help)help.innerHTML=r.selectionActive?'Selezione attiva. <strong>Premi ESC sulla tastiera per terminarla.</strong>':'Clicca “Seleziona elementi”, poi clicca tutti gli elementi che vuoi oscurare. <strong>Per terminare la selezione premi ESC sulla tastiera.</strong>';
  }
  $('close').onclick=()=>window.close();
  $('enabled').onchange=async e=>{const r=await send('POPUP_SET_EXTENSION_ENABLED',{enabled:e.target.checked});if(!r?.ok)status(r?.error||'Impossibile modificare lo stato.');else{await saveSelectionPreferences();status(e.target.checked?'Estensione attivata.':'Estensione disattivata.');await refresh()}};
  $('effect').onchange=async()=>{await saveSelectionPreferences();status('Effetto salvato per la prossima selezione.')};
  $('intensity').oninput=()=>{$('intensityValue').textContent=`${$('intensity').value}%`};
  $('intensity').onchange=async()=>{await saveSelectionPreferences();status('Intensità salvata per la prossima selezione.')};
  $('select').onclick=async()=>{await saveSelectionPreferences();const r=await send('POPUP_START_SELECTION');if(r?.ok){status('Selezione attiva. Clicca tutti gli elementi da oscurare. Premi ESC per terminare.');window.close()}else status(r?.error||'Impossibile avviare la selezione.')};
  $('toggleAll').onclick=async()=>{const current=await send('POPUP_GET_STATE');if(!current?.ok)return status(current?.error||'Impossibile leggere le regole.');const rules=current.rules||[];if(!rules.length)return status('Non ci sono regole salvate.');const allDisabled=rules.every(rule=>rule.enabled===false),type=allDisabled?'POPUP_ENABLE_ALL_RULES':'POPUP_DISABLE_ALL_RULES',r=await send(type);if(r?.ok){status(allDisabled?'Tutti gli oscuramenti sono stati riabilitati.':'Tutti gli oscuramenti sono stati disattivati.');await refresh()}else status(r?.error||'Impossibile modificare gli oscuramenti.')};
  $('deleteAll').onclick=async()=>{if(!confirm('Eliminare TUTTI gli oscuramenti salvati? Questa operazione non può essere annullata.'))return;const r=await send('POPUP_DELETE_ALL_RULES');if(r?.ok){status('Tutti gli oscuramenti sono stati eliminati.');await refresh()}else status(r?.error||'Impossibile eliminare gli oscuramenti.')};
  refresh();
})();
