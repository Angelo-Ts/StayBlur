# progettoBlur — Project Status

## Current state

The current branch is `copilot/add-phase-1-5-design`.

Implemented and manually validated during development:

- Chromium/Edge Manifest V3 extension structure.
- Native browser popup, without opening a separate extension window.
- Manual element selection with target refinement for text wrappers, blocks, controls and media.
- Persistent rules in `chrome.storage.local`, partitioned by domain/path.
- Automatic re-application after refresh/browser restart.
- SPA navigation handling (`pushState`, `replaceState`, `popstate`, `hashchange`).
- Dynamic DOM / virtualized DOM re-application fast path.
- Shadow DOM traversal for open shadow roots.
- Safety-first matcher with multiple fingerprint signals, confidence threshold and ambiguity guard.
- Protection against duplicate rules on an already obscured element.
- Runtime integrity checks to restore effects removed by page scripts or DOM churn.
- Effects: blur, strong blur, pixelate, blackout and hide.
- User-selectable effect and intensity from the popup.
- Temporary page suppression and permanent rule deletion.
- Extension-wide enable/disable gate.
- Automated unit test suite: 9 tests currently passing.
- GitHub Actions `Check` workflow passing on the current branch.

## Known limitations / next work

### High priority

1. Browser E2E coverage: real Edge/Chromium scenarios are not yet automated.
2. Selection lifecycle hardening: verify suppression, deletion and reactivation across dynamic pages.
3. Cross-frame rule identity: same-origin iframe support needs explicit frame-aware rule context to avoid collisions.
4. Rendering consolidation: the runtime currently contains duplicated rendering logic between content scripts and `extension/core`.
5. Effect correctness: pixelation is experimental and currently not considered final UX. It may be removed or redesigned later.

### Medium priority

6. More integration tests for content/background messaging.
7. More tests for SPA navigation and MutationObserver behaviour.
8. More adversarial matcher tests focused on false-positive prevention.
9. Performance pass on very large DOMs and pages with aggressive re-rendering.
10. Documentation for installation, supported browsers and limitations.

### Lower priority / future

11. Better site-vs-page scope UX.
12. Optional rule editing after creation.
13. Closed Shadow DOM support, if technically feasible.
14. Improved handling for canvas/video-specific content where sub-element selection is impossible.
15. Packaging/release process for Edge/Chrome/Brave/Opera and macOS validation.

## Rough completion estimate

The core v1 behaviour is substantially implemented. A reasonable estimate is **around 75–80% of a polished v1 release**.

The remaining work is weighted toward reliability and validation rather than adding many new user-facing features. The largest milestone is browser E2E testing plus fixing anything exposed by real-world pages.

Pixelation is deliberately not treated as a blocker: it can be removed or redesigned after the rest of the extension is stable.
