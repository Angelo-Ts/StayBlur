# progettoBlur

> **Persistent, safety-first element obscuring for Chromium browsers.**

progettoBlur is a Manifest V3 browser extension for temporarily hiding sensitive or distracting page elements during live presentations, demos, screen sharing, and everyday browsing.

Select an element on a web page, choose an obscuring effect, and progettoBlur remembers the rule locally. The effect is restored after page refreshes and browser restarts until you explicitly disable or delete the rule.

## V1.0.0

The V1 baseline is validated on **Microsoft Edge on Windows**.

### Highlights

- Manual element selection directly on the page.
- Persistent rules stored locally with `chrome.storage.local`.
- Rules can target a single page or an entire site/domain.
- Automatic re-application after refresh and browser restart.
- SPA/navigation and dynamic-DOM handling.
- Same-origin iframe support.
- Open Shadow DOM traversal.
- Safety-first matching designed to prefer false negatives over false positives.
- Multiple obscuring effects:
  - Blur
  - Strong blur
  - Pixelate (experimental)
  - Blackout
  - Hide
- Adjustable blur intensity.
- Individual rule enable/disable.
- Global enable/disable/reactivation.
- Explicit rule deletion.
- No backend and no external transmission of saved rule data.

## Safety model

A saved rule is **not** re-applied merely because a CSS selector happens to match an element.

The matcher combines several identifying signals such as stable IDs/classes, semantic attributes, text fingerprints, ancestor/structure context, geometry and selector information. Automatic application is gated by confidence, independent identifying evidence, and ambiguity checks.

The core safety principle is:

> **False positives are unacceptable; false negatives are preferable.**

If the extension cannot identify an element with sufficient confidence, it leaves the page unchanged.

## Known V1 limitations

These are intentionally outside the V1 acceptance gate and are planned for later hardening:

- Blackout rendering can be imperfect on some text elements.
- Blackout rendering inside some open Shadow DOM content can be visually incorrect.
- Pixelation is experimental.
- Complex visual content such as canvas/video sub-content may require specialized rendering.
- Closed Shadow DOM is not currently targeted.
- The initial supported platform is Edge/Windows; broader Chromium and macOS validation comes later.

## Installation in Microsoft Edge (developer mode)

1. Clone the repository.
2. Open `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the repository's `extension/` directory.
6. Open a normal `http://` or `https://` page and click the progettoBlur toolbar icon.

> Browser-internal pages such as `edge://...` cannot be modified by normal extensions and are not supported test targets.

## Development

Requirements:

- Node.js
- npm
- Microsoft Edge (for the primary manual validation)

Install dependencies:

```bash
npm ci
```

Run the complete automated check:

```bash
npm run check
```

This runs:

- TypeScript build/type checking
- Vitest unit tests
- Manifest/extension validation

Run tests only:

```bash
npm test
```

## Project structure

```text
extension/     Manifest V3 extension shipped to the browser
src/           TypeScript core models, storage and matcher logic
tests/         Automated tests and manual V1 fixture
scripts/       Validation/build support scripts
docs/          Focused testing and engineering notes
.github/       CI configuration
```

## Release process

Releases use semantic version tags such as `v1.0.0`.

For V1, the intended sequence is:

1. Keep `main` green and validated.
2. Align the extension/package version with the release version.
3. Create a Git tag such as `v1.0.0` from `main`.
4. Create a GitHub Release from that tag.
5. Attach a packaged extension archive when a distributable build is required.

GitHub also provides generated release notes when creating a release from the **Releases** page.

## Roadmap

### V1.1 / hardening

- Consolidate runtime/core matcher logic where safe.
- Improve candidate discovery and fingerprint performance on large pages.
- Harden navigation, DOM mutation and frame lifecycle handling.
- Expand integration and adversarial tests.
- Improve blackout rendering and replace/redesign pixelation.
- Improve packaging and clean-install validation across Chromium browsers.

### Future

- Chrome/Brave/Opera distribution.
- macOS validation.
- Optional rule editing and richer scope controls.
- More specialized canvas/video handling.
- Additional advanced obscuring rules.

## Privacy

Saved rules are local browser data. V1 does not use a backend or intentionally transmit page URLs, page content, images, text, or element information to an external server.

## License

ISC
