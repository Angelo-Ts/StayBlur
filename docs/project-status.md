# progettoBlur — Project Status

## Current state

The current branch is `copilot/add-phase-1-5-design`.

### V1 functional acceptance

The manual V1 acceptance flow has been completed on Microsoft Edge/Windows using the repository fixture. The fundamental persistence flow and the manual acceptance blocks have been exercised successfully, including SPA navigation, same-origin iframe selection, multiple rules, rule deletion, single-rule enable/disable, and global enable/disable/reactivation.

The final V1 acceptance flow (block M) passed, and no false-positive was observed in the safety checks (block J).

### Implemented

- Chromium/Edge Manifest V3 extension structure.
- Native browser popup, without opening a separate extension window.
- Manual element selection with target refinement for text wrappers, blocks, controls and media.
- Persistent rules in `chrome.storage.local`, partitioned by domain/path.
- Automatic re-application after refresh/browser restart.
- SPA navigation handling (`pushState`, `replaceState`, `popstate`, `hashchange`).
- Dynamic DOM / virtualized DOM re-application.
- Same-origin iframe selection and frame-aware rule context.
- Shadow DOM traversal for open shadow roots.
- Safety-first matcher with multiple fingerprint signals, confidence threshold and ambiguity guard.
- Protection against duplicate rules on an already obscured element.
- Runtime integrity checks to restore effects removed by page scripts or DOM churn.
- Effects: blur, strong blur, pixelate, blackout and hide.
- User-selectable effect and intensity from the popup.
- Temporary page suppression and permanent rule deletion.
- Single-rule enable/disable/reactivation.
- Global enable/disable/reactivation of saved rules.
- Extension-wide enable/disable gate.
- Automated unit test suite and GitHub Actions validation.
- Manifest validation for required MV3 structure, permissions, host access and content-script configuration.

## Known limitations / post-V1 backlog

These are deliberately not blockers for the accepted V1 functional flow:

1. **Blackout on text:** on some text elements the blackout effect does not render as a true opaque black result and can leave text visually white.
2. **Blackout inside open Shadow DOM:** blackout rendering can leave the interior of a Shadow DOM element visually incorrect even though the element is otherwise obscured.
3. **Pixelation:** the current implementation is experimental and needs a more robust rendering strategy before being considered final UX.
4. **Complex rendering:** canvas/video-specific and other browser-rendered sub-content may require specialized handling where DOM selection cannot target the visual sub-content directly.

## Next engineering work

### Priority 1 — hardening

- Consolidate duplicated runtime/core matcher and rendering logic where safe.
- Preserve the safety invariant: false negatives are preferable to false positives.
- Harden rule lifecycle across navigation, DOM replacement and repeated mutations.
- Optimize candidate discovery and fingerprint computation on large/dynamic pages.
- Review background/content messaging and frame coordination.

### Priority 2 — automated validation

- Add focused integration tests for content/background messaging.
- Add lifecycle tests for deletion, disable/enable and reactivation.
- Add SPA/MutationObserver regression tests.
- Expand adversarial matcher coverage.
- Add targeted performance/large-DOM checks.

### Priority 3 — release candidate

- Finalize README and installation/limitations documentation.
- Review versioning and release metadata.
- Validate clean installation on Edge and Chromium-based browsers.
- Prepare packaging/release process for Edge/Chrome/Brave/Opera; macOS validation remains future work.
- Perform final security/safety audit.

## Future / V1.1+

- Rework blackout rendering for text and Shadow DOM.
- Replace/redesign pixelation.
- Better site-vs-page scope UX.
- Optional rule editing after creation.
- Closed Shadow DOM support, if technically feasible.
- Additional canvas/video-specific rendering support.
- Browser portability and macOS validation beyond the initial Edge/Windows target.
