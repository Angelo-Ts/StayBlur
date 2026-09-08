import type { Rule } from '../../../src/core/models/rule.js';

export const sampleRule = (): Rule => ({
  ruleId: 'rule-1',
  scope: 'page',
  domain: 'example.com',
  path: '/settings',
  enabled: true,
  status: 'active',
  effect: 'blur',
  intensity: 70,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  fingerprint: {
    generatedAt: '2026-01-01T00:00:00.000Z',
    generationVersion: '1.5',
    cssSelector: '#settings-panel',
    stableId: {
      value: 'settings-panel',
      confidenceHint: 1
    },
    semanticAttributes: [
      { name: 'role', valueKind: 'structural', value: 'region', stabilityHint: 1 },
      { name: 'aria-label', valueKind: 'hash', value: 'a'.repeat(64), stabilityHint: 1 }
    ],
    stableClasses: [{ className: 'panel', stabilityHint: 1 }, { className: 'secure', stabilityHint: 1 }],
    normalizedTextHash: {
      algorithm: 'SHA-256',
      hash: 'b'.repeat(64),
      sourceLength: 40,
      truncatedLength: 40,
      stable: true
    },
    ancestorContext: {
      chain: [
        {
          tag: 'main',
          semanticAttrs: [{ name: 'role', valueKind: 'structural', value: 'main' }],
          stableClasses: ['layout']
        }
      ],
      depthCaptured: 1
    },
    structureContext: {
      siblingSignature: {
        previousTag: 'h2',
        nextTag: 'button',
        indexWithinStableParent: 2
      },
      childSignature: {
        stableChildTagsTopK: ['h3', 'p'],
        stableChildRolesTopK: ['heading']
      }
    },
    geometricHint: {
      viewportXRatio: 0.5,
      viewportYRatio: 0.4,
      widthRatio: 0.5,
      heightRatio: 0.2
    },
    tagName: 'section',
    excludedSignals: {
      droppedDynamicIds: [],
      droppedDynamicClasses: [],
      droppedVolatileText: false
    }
  }
});
