import { describe, expect, it } from 'vitest';

import { generateFingerprint } from '../../../src/core/fingerprinting/fingerprintGenerator.js';
import { sha256 } from '../../../src/core/fingerprinting/hash.js';

describe('generateFingerprint', () => {
  it('stores page text as hash only and marks dropped volatile signals', () => {
    const fingerprint = generateFingerprint(
      {
        tagName: 'DIV',
        id: 'static-id',
        classes: ['box', 'css-abc123def0'],
        attributes: [
          { name: 'role', value: 'button', stabilityHint: 1 },
          { name: 'aria-label', value: 'Personal Account', stabilityHint: 1 }
        ],
        textContent: ' Account Number: 1234 ',
        textStable: true
      },
      '2026-01-02T00:00:00.000Z'
    );

    expect(fingerprint.normalizedTextHash?.hash).toBe(sha256('account number: 1234'));
    expect(fingerprint.semanticAttributes.find((attr) => attr.name === 'aria-label')?.valueKind).toBe('hash');
    expect(fingerprint.semanticAttributes.find((attr) => attr.name === 'role')?.valueKind).toBe('structural');
    expect(fingerprint.excludedSignals.droppedDynamicClasses).toContain('css-abc123def0');
  });

  it('drops dynamic id and marks volatile text when flagged unstable', () => {
    const fingerprint = generateFingerprint({
      tagName: 'SPAN',
      id: 'a8f44c91e3b24099',
      classes: ['status-pill'],
      attributes: [],
      textContent: '12:04:01',
      textStable: false
    });

    expect(fingerprint.stableId).toBeUndefined();
    expect(fingerprint.excludedSignals.droppedDynamicIds).toContain('a8f44c91e3b24099');
    expect(fingerprint.normalizedTextHash).toBeUndefined();
    expect(fingerprint.excludedSignals.droppedVolatileText).toBe(true);
  });
});
