import type {
  AncestorNodeFingerprint,
  Fingerprint,
  SemanticAttributeFingerprint,
  StableClassFingerprint
} from '../models/fingerprint.js';
import { filterStableTokens } from './dynamicSignalFilter.js';
import { sha256 } from './hash.js';
import { sanitizeAttribute, type RawAttributeInput } from './stableAttributeFilter.js';
import { normalizeText } from './textNormalizer.js';

export interface ElementSnapshot {
  cssSelector?: string;
  id?: string;
  classes: string[];
  attributes: RawAttributeInput[];
  textContent?: string;
  textStable?: boolean;
  tagName: string;
  ancestors?: Array<{
    tag: string;
    attributes: RawAttributeInput[];
    classes: string[];
  }>;
  structureContext?: Fingerprint['structureContext'];
  geometricHint?: Fingerprint['geometricHint'];
}

const toStableClassEntries = (classes: string[]): { entries: StableClassFingerprint[]; dropped: string[] } => {
  const { stable, dropped } = filterStableTokens(classes);

  return {
    entries: stable.map((className) => ({ className, stabilityHint: 1 })),
    dropped
  };
};

const toStableId = (id?: string): { stableId?: Fingerprint['stableId']; dropped?: string } => {
  if (!id) {
    return {};
  }

  const { stable, dropped } = filterStableTokens([id]);

  if (stable.length === 0) {
    return { dropped: dropped[0] };
  }

  return {
    stableId: {
      value: stable[0],
      confidenceHint: 1
    }
  };
};

const toSemanticAttributes = (attributes: RawAttributeInput[]): SemanticAttributeFingerprint[] =>
  attributes.map((attribute) => sanitizeAttribute(attribute));

const toAncestorChain = (
  ancestors: ElementSnapshot['ancestors'] = []
): { chain: AncestorNodeFingerprint[]; droppedClasses: string[]; droppedIds: string[] } => {
  const droppedClasses: string[] = [];
  const droppedIds: string[] = [];

  const chain = ancestors.map((ancestor) => {
    const classResult = toStableClassEntries(ancestor.classes);
    droppedClasses.push(...classResult.dropped);

    const sanitizedAttrs = toSemanticAttributes(ancestor.attributes);
    const idAttr = ancestor.attributes.find((attr) => attr.name.toLowerCase() === 'id');
    if (idAttr) {
      const idResult = toStableId(idAttr.value);
      if (idResult.dropped) droppedIds.push(idResult.dropped);
    }

    return {
      tag: ancestor.tag.toLowerCase(),
      semanticAttrs: sanitizedAttrs.map(({ name, valueKind, value }) => ({ name, valueKind, value })),
      stableClasses: classResult.entries.map(({ className }) => className)
    };
  });

  return { chain, droppedClasses, droppedIds };
};

export const generateFingerprint = (snapshot: ElementSnapshot, now = new Date().toISOString()): Fingerprint => {
  const tagName = snapshot.tagName.toLowerCase();
  const idResult = toStableId(snapshot.id);
  const classResult = toStableClassEntries(snapshot.classes);
  const ancestorResult = toAncestorChain(snapshot.ancestors);

  const semanticAttributes = toSemanticAttributes(snapshot.attributes);

  const textStable = snapshot.textStable !== false;
  const normalizedTextHash = snapshot.textContent && textStable
    ? (() => {
        const normalized = normalizeText(snapshot.textContent);
        return {
          algorithm: 'SHA-256' as const,
          hash: sha256(normalized.normalized),
          sourceLength: normalized.sourceLength,
          truncatedLength: normalized.truncatedLength,
          stable: true
        };
      })()
    : undefined;

  return {
    generatedAt: now,
    generationVersion: '1.5',
    cssSelector: snapshot.cssSelector,
    stableId: idResult.stableId,
    semanticAttributes,
    stableClasses: classResult.entries,
    normalizedTextHash,
    ancestorContext: {
      chain: ancestorResult.chain,
      depthCaptured: ancestorResult.chain.length
    },
    structureContext: snapshot.structureContext ?? {},
    geometricHint: snapshot.geometricHint,
    tagName,
    excludedSignals: {
      droppedDynamicIds: [idResult.dropped, ...ancestorResult.droppedIds].filter(
        (value): value is string => Boolean(value)
      ),
      droppedDynamicClasses: [...classResult.dropped, ...ancestorResult.droppedClasses],
      droppedVolatileText: !textStable || !snapshot.textContent
    }
  };
};
