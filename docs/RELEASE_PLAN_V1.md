# StayBlur — Release plan V1.x

## Versioning

StayBlur follows Semantic Versioning for the public project:

- `1.1.1` — patch release: bug fixes and safe performance corrections, without intentionally changing the public behavior of the extension.
- `1.2.0` — minor release: backward-compatible user-facing features.

The Git tag and release name can use the SemVer form. The Chromium extension `manifest.json` keeps the numeric version format required by the browser; descriptive prerelease information belongs in Git/release metadata rather than the manifest version.

## Development flow

Work in larger implementation blocks rather than one tiny commit at a time. Each block should end with:

1. code/test changes committed on the development branch;
2. `npm run check` passing in CI for the exact head commit;
3. a short review of regression risk;
4. only then the next block.

## V1.1 technical foundation

Current priority:

1. matcher correctness and deterministic ranking;
2. runtime candidate discovery performance;
3. DOM/shadow-root discovery efficiency;
4. integration coverage between persistence, matching and runtime state;
5. only then package/release preparation.

The safety rule remains unchanged: false positives are unacceptable. Performance work must not weaken confidence thresholds or allow a CSS selector alone to auto-apply a rule.

## 1.1.1

Target only verified bugs and low-risk corrections discovered during V1.1 development or manual testing. Do not mix new user-facing features into the patch release.

## 1.2.0

Collect user-facing ideas separately and implement them as independently testable features. Each feature should have an explicit acceptance test before release.

## Release gate

A release is ready only when:

- automated checks are green on the exact release commit;
- the extension loads successfully in Edge;
- persistence survives refresh and browser restart;
- explicit deletion still removes the rule;
- no new false-positive path has been introduced;
- README and release notes match the actual build.
