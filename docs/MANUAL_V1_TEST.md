# progettoBlur — collaudo manuale V1

## Dove fare i test

Usa **Microsoft Edge su Windows**, con l'estensione caricata da `edge://extensions/` in Modalità sviluppatore.

La pagina di prova è:

`tests/manual/v1-fixture.html`

Per aprirla in Edge puoi usare il file locale dalla copia del repository, oppure servirla con un semplice server locale. Esempio dalla root del progetto:

```bash
npx serve .
```

Poi apri la pagina `tests/manual/v1-fixture.html` nell'indirizzo locale indicato dal server.

> Non serve un server remoto e non devi pubblicare la fixture online.

## Prima di iniziare

- [ ] Estensione caricata senza errori
- [ ] Popup si apre
- [ ] Modalità selezione attivabile
- [ ] Hover mostra chiaramente il bordo dell'elemento

## A — requisito fondamentale

- [ ] A1 Seleziona testo → blur → refresh → blur ancora presente
- [ ] A2 Blur → chiudi completamente Edge → riapri → blur ancora presente
- [ ] A3 Blur → elimina blur → refresh → elemento rimane visibile
- [ ] A4 Oscura almeno 4 elementi diversi → refresh → tutti ancora oscurati
- [ ] A5 Elimina tutti → refresh → nessun blur ritorna

## B — tipi di elemento

Testare selezione e persistenza per:

- [ ] testo
- [ ] immagine
- [ ] video
- [ ] button
- [ ] input
- [ ] textarea
- [ ] select
- [ ] card
- [ ] div/container
- [ ] tabella/cella
- [ ] sezione
- [ ] elemento profondamente annidato

Per ogni elemento: **seleziona → oscura → refresh → verifica → elimina**.

## C — effetti

Sulmeno su un'immagine/card:

- [ ] Blur normale
- [ ] Blur intenso
- [ ] Pixelizzazione
- [ ] Oscuramento completo
- [ ] Nascondimento

Per ogni effetto verificare anche il refresh.

## D — intensità

Provare almeno:

- [ ] 0%
- [ ] 25%
- [ ] 50%
- [ ] 75%
- [ ] 100%

Verificare che l'intensità scelta venga mantenuta dopo il refresh.

## E — riconoscimento

- [ ] elemento con ID stabile
- [ ] elemento identificato soprattutto da classi
- [ ] elemento profondamente annidato
- [ ] uno solo di più elementi molto simili

### Regola di sicurezza

Se la pagina viene modificata e il sistema non è sufficientemente sicuro nel riconoscere l'elemento, è **accettabile che il blur non venga applicato**.

Non è accettabile che venga oscurato un elemento sbagliato.

## F — DOM dinamico

Attendere la creazione automatica dell'elemento dinamico.

- [ ] Oscura `Elemento dinamico`
- [ ] refresh
- [ ] attesa della ricreazione
- [ ] verifica del blur
- [ ] usa `Rimuovi e ricrea elemento dinamico`
- [ ] verifica che la regola venga considerata nuovamente

## G — SPA simulata

- [ ] Oscura un elemento nella vista Home
- [ ] passa a Impostazioni
- [ ] torna a Home
- [ ] verifica il blur
- [ ] ripeti su un'altra vista

## H — Shadow DOM

- [ ] seleziona `Elemento Shadow DOM`
- [ ] verifica il blur
- [ ] refresh
- [ ] verifica persistenza

## I — iframe

- [ ] seleziona l'elemento nell'iframe same-origin
- [ ] verifica il blur
- [ ] refresh
- [ ] verifica persistenza

Un iframe cross-origin può essere limitato dalle policy del browser: non considerare automaticamente questo caso un fallimento della V1.

## J — sicurezza

- [ ] modifica/rimuovi una caratteristica identificativa e verifica che non venga scelto un elemento sbagliato
- [ ] con candidati simili verifica che non venga scelto casualmente un candidato
- [ ] se il match è ambiguo, nessun falso positivo

## K — comportamento normale

Fuori dalla modalità selezione:

- [ ] pulsanti funzionano
- [ ] input funzionano
- [ ] link/menu non vengono bloccati
- [ ] scrolling normale

In modalità selezione:

- [ ] il click seleziona l'elemento
- [ ] il click non esegue, quando possibile, l'azione originale del sito

## L — popup / UX

- [ ] ON/OFF
- [ ] Seleziona elemento
- [ ] Elimina blur
- [ ] Elimina tutti
- [ ] scelta effetto
- [ ] slider intensità
- [ ] gestione regole

## M — test finale V1

Eseguire esattamente questo flusso:

1. [ ] apri la fixture in Edge
2. [ ] seleziona un elemento
3. [ ] applica blur
4. [ ] refresh
5. [ ] blur ancora presente
6. [ ] chiudi completamente Edge
7. [ ] riapri Edge
8. [ ] riapri la fixture
9. [ ] blur ancora presente
10. [ ] elimina blur
11. [ ] refresh
12. [ ] elemento nuovamente visibile

### Criterio di accettazione

La V1 è considerata pronta quando il flusso M passa e non vengono rilevati falsi positivi nel blocco J.

I problemi secondari di compatibilità o casi avanzati possono essere registrati come backlog V1.1 invece di bloccare la consegna, purché non compromettano il requisito fondamentale.

## Come riportare un problema

Inviare una lista breve, per esempio:

```text
A1 ✅
A2 ✅
A3 ❌ — dopo refresh il blur sparisce
B immagine ✅
B video ⚠️ — effetto poco visibile
E4 ❌ — viene oscurato il candidato sbagliato
M ❌
```
