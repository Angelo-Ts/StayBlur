import { collectSemanticAttributes } from './attributes.js';
import { filterStableTokens } from './dynamic-filter.js';
import { sha256 } from './hash.js';
import { isLikelyVolatileText, normalizeText } from './text.js';

const safeNthOfType = (element) => {
  const parent = element.parentElement;
  if (!parent) return 1;

  const siblings = [...parent.children].filter((child) => child.tagName === element.tagName);
  return Math.max(1, siblings.indexOf(element) + 1);
};

const buildCssSelector = (element, stableId, stableClasses) => {
  if (stableId) {
    return `#${CSS.escape(stableId)}`;
  }

  const tag = element.tagName.toLowerCase();
  if (stableClasses.length > 0) {
    return `${tag}.${stableClasses.slice(0, 2).map((cls) => CSS.escape(cls)).join('.')}`;
  }

  return `${tag}:nth-of-type(${safeNthOfType(element)})`;
};

const extractAncestorContext = async (element, maxDepth = 4) => {
  const chain = [];
  let current = element.parentElement;
  let depth = 0;

  while (current && depth < maxDepth) {
    const semanticAttrs = await collectSemanticAttributes(current);
    const classTokens = current.className ? String(current.className).split(/\s+/).filter(Boolean) : [];
    const { stable } = filterStableTokens(classTokens);

    chain.push({
      tag: current.tagName.toLowerCase(),
      semanticAttrs: semanticAttrs.map(({ name, valueKind, value }) => ({ name, valueKind, value })),
      stableClasses: stable
    });

    current = current.parentElement;
    depth += 1;
  }

  return {
    chain,
    depthCaptured: chain.length
  };
};

const extractStructureContext = (element) => {
  const parent = element.parentElement;
  const siblings = parent ? [...parent.children] : [];
  const currentIndex = siblings.indexOf(element);
  const previous = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

  const children = [...element.children];
  const childTags = [];
  const childRoles = [];

  for (const child of children.slice(0, 5)) {
    childTags.push(child.tagName.toLowerCase());
    const role = child.getAttribute('role');
    if (role) childRoles.push(role.toLowerCase());
  }

  return {
    siblingSignature: {
      previousTag: previous?.tagName.toLowerCase(),
      nextTag: next?.tagName.toLowerCase(),
      indexWithinStableParent: currentIndex >= 0 ? currentIndex : undefined
    },
    childSignature: {
      stableChildTagsTopK: [...new Set(childTags)].slice(0, 3),
      stableChildRolesTopK: [...new Set(childRoles)].slice(0, 3)
    }
  };
};

const extractGeometryHint = (element) => {
  const rect = element.getBoundingClientRect();
  const vw = Math.max(window.innerWidth, 1);
  const vh = Math.max(window.innerHeight, 1);

  return {
    viewportXRatio: Math.min(1, Math.max(0, rect.x / vw)),
    viewportYRatio: Math.min(1, Math.max(0, rect.y / vh)),
    widthRatio: Math.min(1, Math.max(0, rect.width / vw)),
    heightRatio: Math.min(1, Math.max(0, rect.height / vh))
  };
};

export const generateFingerprintFromElement = async (element, now = new Date().toISOString()) => {
  const classTokens = element.className ? String(element.className).split(/\s+/).filter(Boolean) : [];
  const classResult = filterStableTokens(classTokens);

  const idResult = filterStableTokens([element.id].filter(Boolean));
  const stableId = idResult.stable[0];

  const semanticAttributes = await collectSemanticAttributes(element);
  const textContent = element.textContent ?? '';
  const textStable = !isLikelyVolatileText(textContent);
  const normalizedText = normalizeText(textContent);
  const normalizedTextHash = textStable && normalizedText.normalized
    ? {
        algorithm: 'SHA-256',
        hash: await sha256(normalizedText.normalized),
        sourceLength: normalizedText.sourceLength,
        truncatedLength: normalizedText.truncatedLength,
        stable: true
      }
    : undefined;

  const ancestorContext = await extractAncestorContext(element);

  return {
    generatedAt: now,
    generationVersion: '1.5',
    cssSelector: buildCssSelector(element, stableId, classResult.stable),
    stableId: stableId
      ? {
          value: stableId,
          confidenceHint: 1
        }
      : undefined,
    semanticAttributes,
    stableClasses: classResult.stable.map((className) => ({ className, stabilityHint: 1 })),
    normalizedTextHash,
    ancestorContext,
    structureContext: extractStructureContext(element),
    geometricHint: extractGeometryHint(element),
    tagName: element.tagName.toLowerCase(),
    excludedSignals: {
      droppedDynamicIds: idResult.dropped,
      droppedDynamicClasses: classResult.dropped,
      droppedVolatileText: !textStable
    }
  };
};
