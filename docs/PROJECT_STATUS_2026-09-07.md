# progettoBlur — stato progetto e stima completamento

Data audit: 2026-09-07  
Branch: `copilot/add-phase-1-5-design`

## Stato sintetico

Il nucleo v1 è già in una fase avanzata: selezione manuale, persistenza locale, applicazione degli effetti, fingerprinting safety-first, matching con soglie conservative, frame context, Shadow DOM aperto, retry/riapplicazione e controlli CI sono presenti.

**Stima:** circa **70–80% del v1 funzionale**. La percentuale non è una misura automatica di coverage: è una stima ingegneristica basata sulla struttura attuale del repository e sui requisiti concordati.

## Già presente / sostanzialmente completato

- Selezione manuale con evidenziazione hover.
- Scelta effetto e intensità dal popup.
- Persistenza delle regole in `chrome.storage.local`.
- Separazione per dominio/percorso.
- Gate persistente di abilitazione estensione.
- Fingerprint con ID/classi stabili, attributi semantici, hash testo, antenati, struttura, geometria e selector CSS.
- Protezione contro identificatori/testi evidentemente volatili.
- Matching safety-first: niente auto-apply con CSS selector isolato; soglia di confidenza alta; almeno 3 categorie indipendenti; gestione dell'ambiguità.
- Context key per iframe e supporto a frame multipli.
- Scansione di Shadow DOM aperto.
- MutationObserver/retry e riapplicazione su DOM dinamico.
- Supporto SPA/navigation già impostato.
- Test unitari per fingerprinting, frame, storage e decisione/matching.
- Test adversarial e test di parity tra matcher runtime e core.
- CI con build, test e validazione dell'estensione.

## Mancanze principali prima di considerare il v1 pronto

### 1. E2E reale nel browser — **alta priorità**

È il gap più importante. I test attuali non sostituiscono una prova reale con Edge/Chromium.

Da coprire almeno:
- selezione di elementi reali e persistenza dopo refresh;
- riavvio del browser;
- SPA con sostituzione del DOM;
- elementi aggiunti dopo il caricamento;
- iframe same-origin;
- Shadow DOM aperto;
- ambiguità: il target non deve essere oscurato;
- modifica del DOM che rende il fingerprint non affidabile;
- effetti blur/strong blur/blackout/hide/pixelate;
- rimozione/disattivazione della regola;
- popup → content script.

### 2. Parità runtime/core — **medio-alta**

È stato aggiunto un contratto di parity, ma il matcher browser è ancora implementato separatamente dal matcher TypeScript. Il test impedisce alcune divergenze, non garantisce equivalenza completa delle algoritmiche.

Obiettivo: portare la logica comune in un modulo condiviso oppure definire un adapter runtime testabile.

### 3. Robustezza/performance del matcher — **media**

Punti da verificare:
- costo della scansione ricorsiva degli ShadowRoot;
- hashing SHA-256 ripetuto durante lo scoring;
- limite di 1000 candidati e ordine di discovery;
- comportamento su pagine molto grandi;
- evitare lavoro ripetuto durante raffiche di mutation.

### 4. Effetti visivi — **media**

`pixelate` è attualmente un'approssimazione tramite blur/contrast, non una pixelizzazione vera. Blackout/hide devono essere verificati con contenuti complessi, immagini, video, figli e pseudo-elementi.

### 5. Gestione lifecycle e UX — **media**

Da verificare end-to-end:
- feedback chiaro quando una regola è `ambiguous`/`notFound`;
- gestione di regole obsolete;
- cancellazione completa degli indici associati;
- stato dopo reload/restart;
- comportamento quando una pagina cambia path/query/hash;
- prevenzione di effetti residui dopo aggiornamenti o rimozione della regola.

### 6. Packaging/release — **media-bassa**

Prima della release servono una procedura ripetibile per build/package, manifest/versioning, installazione pulita e smoke test su Edge/Chrome/Brave/Opera. La portabilità completa cross-browser va verificata, non solo assunta dalla compatibilità MV3.

## Stima residua

| Area | Stato | Residuo stimato |
|---|---|---:|
| Core selezione/persistenza | quasi completo | 5–10% |
| Safety matcher | avanzato | 10–15% |
| DOM dinamico / SPA | avanzato ma da E2E | 10–15% |
| iframe / Shadow DOM | implementato, da E2E | 10% |
| Effetti | implementati, da validare | 10–15% |
| UX/popup lifecycle | avanzato | 10–15% |
| Test browser E2E | mancante | 70–100% |
| Packaging/release | da consolidare | 30–50% |

Le percentuali per singola area **non vanno sommate**: servono solo a indicare il lavoro residuo relativo.

## Percorso consigliato verso v1

1. **E2E browser harness** con una pagina fixture controllata.
2. Test adversarial reali contro false positive.
3. Refactor/adapter per ridurre la duplicazione matcher runtime/core.
4. Benchmark su DOM grandi e mutation burst.
5. Correzione/implementazione della pixelizzazione reale.
6. Smoke test di packaging su Chromium/Edge e verifica compatibilità Chrome/Brave/Opera.
7. Ultimo audit safety + release candidate.

## Valutazione finale

Il progetto **non è lontano dal primo v1 utilizzabile**, ma non lo considererei ancora “release-ready” finché non esiste una suite E2E reale nel browser. Il rischio residuo maggiore non è la mancanza di feature di base: è dimostrare che le regole persistenti continuino a comportarsi correttamente su DOM dinamici senza introdurre falsi positivi.
