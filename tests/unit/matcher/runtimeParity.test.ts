import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CATEGORY_WEIGHTS, INDEPENDENT_CATEGORY_SET } from '../../../src/core/matcher/scoreEngine.js';

const runtimePath = resolve(process.cwd(), 'extension/content/content-script.js');

describe('runtime matcher parity contract', () => {
  it('keeps runtime scoring weights aligned with the tested matcher core', async () => {
    const source = await readFile(runtimePath, 'utf8');

    for (const [category, weight] of Object.entries(CATEGORY_WEIGHTS)) {
      expect(source).toContain(`${category}: ${String(weight).replace(/^0\./, '.')}`);
    }
  });

  it('keeps the same independent categories in the browser runtime', async () => {
    const source = await readFile(runtimePath, 'utf8');
    const match = source.match(/const INDEPENDENT = \[(.*?)\];/s);

    expect(match?.[1]).toBeDefined();
    for (const category of INDEPENDENT_CATEGORY_SET) {
      expect(match?.[1]).toContain(`'${category}'`);
    }
    expect(INDEPENDENT_CATEGORY_SET).toHaveLength(6);
  });

  it('keeps the browser runtime safety gate explicit', async () => {
    const source = await readFile(runtimePath, 'utf8');

    expect(source).toContain('const SAFETY_MIN_CONFIDENCE = .85;');
    expect(source).toContain('const SAFETY_MIN_INDEPENDENT = 3;');
    expect(source).not.toContain('exactSelectorSafe');
    expect(source).not.toContain("status: 'active', confidence: 1");
  });
});
