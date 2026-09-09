<p align="center">
  <img src="assets/branding/stayblur-icon-source.svg" width="140" alt="StayBlur icon">
</br>
  <img src="assets/branding/stayblur-wordmark.svg" width="420" alt="StayBlur">
</p>

<p align="center"><strong>Persistent blur for the web.</strong><br>Hide what you don't want to show. Keep it hidden until you decide otherwise.</p>

<hr/>

StayBlur is a Manifest V3 browser extension that lets you select elements on a webpage and obscure them — with the important difference that the change **stays there after a page reload**.

Built for live demos and presentations where you want sensitive or distracting content hidden without changing the website itself.

## Identity

StayBlur's visual identity is built around a **protected browser window + lock** and a blue → indigo → violet gradient.

The interaction language deliberately separates actions:

- **Blue:** StayBlur / selection mode
- **ESC:** exits the active continuous selection mode
- **Red outline:** destructive removal actions such as deleting saved obscurations
- **Blue outline:** focuses a saved rule's corresponding element on the page

Brand source files live in [`assets/branding`](assets/branding/).

## V1.1.1

- Select visible page elements manually
- Select multiple elements in one continuous selection session
- Blur, strong blur, pixelation, blackout and hide effects
- Adjustable blur intensity
- Rules persist across refreshes and browser restarts
- Works with dynamic DOM / SPA pages
- Same-origin iframe support
- Open Shadow DOM support
- Safety-first matching: uncertain matches are not applied automatically
- Individual or global enable/disable
- Explicit rule deletion
- Local-only storage
- Microsoft Edge / Windows first, with Chromium portability in mind
- Hardened content-script messaging to avoid unnecessary reinjection races

## Install locally on Microsoft Edge

1. Download the `extension` folder from the repository or from the release package.
2. Open `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `extension` folder.

After changing the extension source, use **Reload** in `edge://extensions` to load the updated version.

## Development

```bash
npm ci
npm run check
```

The checks cover TypeScript compilation, unit tests and extension manifest validation.

## Project structure

```text
extension/
  background/       Manifest V3 service worker
  content/          Selection, matching, rendering and page integration
  icons/            StayBlur extension identity assets
  popup/            Extension UI
src/core/           TypeScript domain, storage and matcher modules
tests/              Unit and integration-oriented tests
docs/               Manual validation and performance notes
assets/branding/    Canonical StayBlur brand assets
```

## Safety model

StayBlur prefers a missed match over a wrong match. A saved rule is only re-applied automatically when the matcher has enough independent evidence that the current element is the intended one. If confidence is insufficient, the rule remains saved but is not applied to a potentially wrong element.

## Known limitations

- Blackout can be visually imperfect on some text elements.
- Blackout inside some Shadow DOM content still needs rendering hardening.
- Pixelation is experimental.
- Complex canvas/video content may need specialized handling.
- V1.1.1 validation targets Microsoft Edge on Windows.

## What's next

Future releases will focus on matcher consolidation, performance, broader Chromium validation, and hardening the known rendering limitations.

## License

ISC
