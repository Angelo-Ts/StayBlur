# Phase 1.5 Technical Design — progettoBlur (Chromium MV3)

## Scope and objective
Phase 1.5 defines a concrete, safety-first architecture for persistent element obscuring in Chromium/Edge Manifest V3.

Primary invariant:
- A saved rule re-applies after refresh and browser restart until explicit user action changes/removes behavior.

Safety invariant:
- False positives are unacceptable.
- False negatives are acceptable.
- If certainty is insufficient, do not auto-apply.

---

## 1) Final folder structure

```text
/home/runner/work/progettoBlur/progettoBlur/
  manifest.json
  README.md
  docs/
    phase-1.5-technical-design.md
  src/
    background/
      serviceWorker.ts
      messageRouter.ts
    content/
      contentScript.ts
      selectionController.ts
      domObserver.ts
      spaNavigation.ts
      shadowDomWalker.ts
      iframeCoordinator.ts
      ruleApplier.ts
    core/
      models/
        rule.ts
        fingerprint.ts
        settings.ts
        states.ts
      matcher/
        categories.ts
        candidateDiscovery.ts
        scoreEngine.ts
        decisionEngine.ts
        dynamicSignalFilter.ts
      fingerprinting/
        fingerprintGenerator.ts
        textNormalizer.ts
        stableAttributeFilter.ts
      rendering/
        effectRenderer.ts
        styleRegistry.ts
      storage/
        storageKeys.ts
        ruleRepository.ts
        indexRepository.ts
      retry/
        retryCoordinator.ts
      messaging/
        contracts.ts
        channels.ts
    popup/
      popup.html
      popup.ts
      popup.css
      stateViewModel.ts
  tests/
    unit/
      matcher/
      fingerprinting/
      storage/
      retry/
      messaging/
    integration/
      content-background/
      spa-observer/
    e2e/
      fixtures/
      scenarios/
```

---

## 2) Exact schemas (Rule / Fingerprint / Settings)

### 2.1 Rule schema

```ts
Rule {
  ruleId: string;                     // UUID v4
  scope: 'page' | 'site';

  domain: string;                     // normalized host, no protocol
  path?: string;                      // normalized path for page scope
  url?: string;                       // optional canonical URL snapshot

  enabled: boolean;                   // persistent eligibility gate

  // Current runtime state in the CURRENT evaluated page context.
  // It is not permanent validity of the rule.
  status: 'active' | 'ambiguous' | 'notFound' | 'disabled';
  statusContext?: {
    domain: string;
    path?: string;
    evaluatedAt: string;
  };

  effect: 'blur' | 'strongBlur' | 'pixelate' | 'blackout' | 'hide';
  intensity: number;                  // 0..100

  fingerprint: Fingerprint;

  createdAt: string;                  // ISO timestamp
  updatedAt: string;                  // ISO timestamp
  lastMatchedAt?: string;             // ISO timestamp
  lastConfidence?: number;            // 0..1

  retryMeta?: {
    autoRetryAttemptsCurrentLoad: number;
    lastRetryAt?: string;
    retryWindowClosedAt?: string;
  };
}
```

### 2.2 Fingerprint schema

```ts
Fingerprint {
  generatedAt: string;
  generationVersion: '1.5';

  // Fast path only, never sufficient alone for auto-apply
  cssSelector?: string;

  stableId?: {
    value: string;
    confidenceHint: number;
  };

  // Conservative persistence: no raw text-like values.
  // valueKind='structural' is allowed only for strict whitelist (e.g. role/type)
  // otherwise valueKind='hash' with SHA-256.
  semanticAttributes: Array<{
    name: string;
    valueKind: 'hash' | 'structural';
    value: string;
    stabilityHint: number;
  }>;

  stableClasses: Array<{
    className: string;
    stabilityHint: number;
  }>;

  // Page text remains hash-only.
  normalizedTextHash?: {
    algorithm: 'SHA-256';
    hash: string;
    sourceLength: number;
    truncatedLength: number;
    stable: boolean;
  };

  ancestorContext: {
    chain: Array<{
      tag: string;
      semanticAttrs: Array<{ name: string; valueKind: 'hash' | 'structural'; value: string }>;
      stableClasses: string[];
    }>;
    depthCaptured: number;
  };

  structureContext: {
    siblingSignature?: {
      previousTag?: string;
      nextTag?: string;
      indexWithinStableParent?: number;
    };
    childSignature?: {
      stableChildTagsTopK: string[];
      stableChildRolesTopK: string[];
    };
  };

  geometricHint?: {
    viewportXRatio: number;
    viewportYRatio: number;
    widthRatio: number;
    heightRatio: number;
  };

  tagName: string;

  excludedSignals: {
    droppedDynamicIds: string[];
    droppedDynamicClasses: string[];
    droppedVolatileText: boolean;
  };
}
```

### 2.3 Settings schema

```ts
ExtensionSettings {
  extensionEnabled: boolean;
  defaultEffect: 'blur' | 'strongBlur' | 'pixelate' | 'blackout' | 'hide';
  defaultIntensity: number;
  defaultScope: 'page' | 'site';

  selectionMode: {
    active: boolean;
    showIndicator: boolean;
  };

  matcherPolicy: {
    autoApplyThreshold: 0.85;
    ambiguousThreshold: 0.60;
    topGapAmbiguousDelta: 0.05;
    minIndependentCategories: 3;
    minCategoryContribution: 0.65;
  };

  retryPolicy: {
    mutationDebounceMs: 150;
    inactivityWindowMs: 5000;
    maxAutoRetryAttemptsPerRulePerLoad: number;
  };

  ui: {
    showAmbiguousCandidatesV1: boolean;
  };
}
```

---

## 3) Matcher scoring algorithm and decision matrix

### 3.1 Deterministic candidate set and ranking
For each rule in scope, produce candidate set `Cand = {c1...cn}` deterministically from:
1. CSS fast-path hits.
2. Stable-id/semantic-attribute anchor queries.
3. Ancestor-anchored structural expansion.
4. Open Shadow DOM traversal.

Each candidate gets a deterministic `candidateId` (stable DOM path key). Candidates are sorted deterministically after scoring by:
1. `totalScore` desc,
2. `independentContributions` desc,
3. `semanticAttributesScore` desc,
4. `candidateId` lexicographic asc.

`C1` = first candidate in sorted list, `C2` = second candidate if present.

### 3.2 Categories and weights
Categories and fixed weights `w_k`:
- stableId: 0.26
- semanticAttributes: 0.22
- textHash: 0.14
- stableClasses: 0.12
- ancestorContext: 0.10
- structureContext: 0.08
- cssSelector: 0.04
- geometry: 0.02
- tagName: 0.02

### 3.3 Category score computation (mathematical)
Each category score is `s_k(c) ∈ [0,1]`.

- **stableId**: `1` if exact id match, else `0`.
- **semanticAttributes**:
  - Let fingerprint attrs be `A`.
  - For each `a∈A`, `m(a)=1` if same `(name,valueKind,value)` exists in candidate, else `0`.
  - `s_sem = Σ(stabilityHint(a)*m(a)) / Σ(stabilityHint(a))`.
- **textHash**: `1` if stable text hash equals candidate hash, else `0`.
- **stableClasses**: Jaccard `|F∩C|/|F∪C|`.
- **ancestorContext**:
  - Compare aligned ancestor nodes.
  - Per-node score: `0.5*tagMatch + 0.3*attrJaccard + 0.2*classJaccard`.
  - Category score = mean of node scores.
- **structureContext**: mean of available sibling/child signature checks.
- **cssSelector**: `1` if candidate reached via exact selector fast-path, else `0`.
- **geometry**: `1 - mean(abs(delta ratios))`, clipped to `[0,1]`.
- **tagName**: `1` on exact tag match, else `0`.

### 3.4 Missing category handling and weight renormalization
If a category is unavailable (missing fingerprint signal or missing candidate signal), it is excluded from denominator.

Let `K_avail(c)` be available categories for candidate `c`.

`score(c) = (Σ_{k∈K_avail(c)} w_k * s_k(c)) / (Σ_{k∈K_avail(c)} w_k)`

If `K_avail(c)=∅`, score is `0`.

### 3.5 Independent categories (formalized 6 categories)
Independent category set (used for `minIndependentCategories=3`):
1. stableId
2. semanticAttributes
3. textHash
4. stableClasses
5. ancestorContext
6. structureContext

Rule: multiple signals inside the same category count as **one** category.
A category contributes to independent count only if:
- category is available, and
- `s_k(c) >= minCategoryContribution` (default `0.65`).

`independentContributions(c) = count(eligible categories in the 6-category set)`

### 3.6 Decision matrix
Given `C1`, `C2`:
1. If no candidate or `score(C1) < 0.60` => `notFound`.
2. If `0.60 <= score(C1) < 0.85` => `ambiguous`.
3. If `score(C1) >= 0.85` and `independentContributions(C1) < 3` => `ambiguous`.
4. If `score(C1) >= 0.85` and `|score(C1)-score(C2)| <= 0.05` => `ambiguous`.
5. Else => `active` (auto-apply).

Ambiguous/notFound are never auto-applied.
CSS selector alone never authorizes auto-apply.

---

## 4) Flow: Selection → Fingerprint → Storage → Apply
1. User enables selection mode.
2. Content script highlights hovered element.
3. On click: collect snapshot and generate fingerprint in one operation.
4. Apply conservative sanitization:
   - text => SHA-256 hash only,
   - potentially sensitive/user-specific attributes => hash,
   - structural whitelist only for safe non-sensitive values.
5. Create Rule (`enabled=true`, initial `status` with current page context).
6. Persist to `chrome.storage.local` + domain/path indexes.
7. Validate match locally and apply effect only if safe.
8. Notify popup of rule state.

---

## 5) Flow: Page Load → Load Rules → Match → Apply
1. On load/route change, resolve current domain/path.
2. Load indexed rules only (site+page scope).
3. For each enabled rule: score candidates deterministically.
4. Apply only when decision is `active`.
5. Persist runtime `status` as current-page result (`statusContext`).
6. Keep `ambiguous/notFound` persisted for visibility and Retry.
7. `disabled` rules are not matched/applied.

---

## 6) MutationObserver strategy
- Incremental observer with debounce ~150ms.
- No full rematch per mutation.
- Prioritize `notFound` rules for limited auto-retry.
- Stop auto-retry after inactivity window (~5s) or max attempts.
- Manual Retry always available.
- Handle SPA navigation (pushState/replaceState/popstate/url change).

---

## 7) Messaging design (popup/content/service worker)
- Popup → SW: enable/disable, selection mode, retry, remove blur (page-only), disable rule, delete rule, list rules.
- SW → Content: enter/exit selection, apply rules, retry specific rule, remove rendered effects page-only.
- Content → SW: selection captured, match result, route changed, state update.
- SW → Popup: updated rules/states/errors.

SW is source of truth for persisted data. Content script is source of truth for runtime DOM effects.

---

## 8) Lifecycle/state handling
States:
- active
- ambiguous
- notFound
- disabled

Semantics:
- `status` = current matching/application state in current evaluated page context.
- `enabled` = persistent permission gate for future application.

Operations:
- Remove blur: remove effect on current page only, keep rule.
- Disable: keep rule, set enabled=false, status=disabled.
- Delete: remove rule and indexes permanently.

---

## 9) Module responsibilities
- models: strict types and invariants.
- fingerprinting: one-shot generation + conservative sanitization.
- matcher/scoreEngine: deterministic weighted scoring.
- matcher/decisionEngine: threshold policy and state classification.
- storage/indexRepository: indexed persistence on chrome.storage.local.
- retry/observer: bounded automatic retry, no infinite loops.
- rendering: visual effect application/removal only.
- messaging: typed contracts between popup/content/SW.

---

## 10) Testing strategy (safety-first)
Unit:
- category score formulas and deterministic ordering (C1/C2).
- missing-category renormalization.
- independent category counting (6-category formal set).
- thresholds and top-2-gap ambiguity rule.
- fingerprint privacy: text hash-only and conservative attribute persistence.
- storage index behavior by domain/path.

Integration:
- selection→fingerprint→persist→match.
- status vs enabled semantics.
- remove/disable/delete distinction.
- bounded MutationObserver retry behavior.

E2E:
- persistence across refresh/restart.
- dynamic SPA updates.
- same-origin iframe and open shadow DOM support.
- cross-origin iframe and closed shadow DOM graceful limits.

Acceptance fails if any uncertain match is auto-applied.

---

## Technical limits
- Same-origin iframe: supported.
- Cross-origin iframe internal DOM: not manipulable.
- Open Shadow DOM: supported when accessible.
- Closed Shadow DOM: not accessible.
- Canvas: selectable/obscurable as whole element only.

Design is directly compatible with Edge/Chromium MV3 and future Chromium browsers.
