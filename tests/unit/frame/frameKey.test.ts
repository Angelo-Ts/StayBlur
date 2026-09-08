import { describe, expect, it } from 'vitest';

import { buildFrameKey } from '../../../src/core/frame/frameKey.js';

describe('buildFrameKey', () => {
  it('uses top for the main document', () => {
    expect(buildFrameKey([])).toBe('top');
  });

  it('prefers a stable iframe id', () => {
    expect(buildFrameKey([{ tagName: 'IFRAME', id: 'account-panel', siblingIndex: 4 }]))
      .toBe('frame:0:iframe#account-panel');
  });

  it('falls back to frame name when id is absent', () => {
    expect(buildFrameKey([{ tagName: 'iframe', name: 'settings', siblingIndex: 2 }]))
      .toBe('frame:0:iframe[name=settings]');
  });

  it('uses sibling position only as the last fallback', () => {
    expect(buildFrameKey([{ tagName: 'iframe', siblingIndex: 3 }]))
      .toBe('frame:0:iframe[n=3]');
  });

  it('encodes nested same-origin frame ancestry in order', () => {
    expect(buildFrameKey([
      { tagName: 'iframe', id: 'outer' },
      { tagName: 'iframe', name: 'inner' }
    ])).toBe('frame:0:iframe#outer/1:iframe[name=inner]');
  });

  it('does not serialize URLs or arbitrary document text', () => {
    const key = buildFrameKey([{ tagName: 'iframe', id: 'stable-frame' }]);
    expect(key).not.toContain('http');
    expect(key).not.toContain('?');
    expect(key).toBe('frame:0:iframe#stable-frame');
  });
});
