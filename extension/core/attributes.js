import { sha256 } from './hash.js';

const STRUCTURAL_RAW_WHITELIST = new Set(['role', 'type', 'inputmode', 'rel', 'target']);
const SEMANTIC_ALLOWLIST = [
  /^data-/i,
  /^aria-/i,
  /^name$/i,
  /^role$/i,
  /^type$/i,
  /^href$/i,
  /^inputmode$/i,
  /^rel$/i,
  /^target$/i
];

const NEVER_RAW_PATTERNS = [
  /^aria-/i,
  /^data-/i,
  /^name$/i,
  /^href$/i,
  /^src$/i,
  /^title$/i,
  /^placeholder$/i,
  /^value$/i,
  /^alt$/i
];

export const isSemanticAttribute = (name) => SEMANTIC_ALLOWLIST.some((pattern) => pattern.test(name));

const forceHash = (name) => NEVER_RAW_PATTERNS.some((pattern) => pattern.test(name));

export const sanitizeAttribute = async ({ name, value, stabilityHint = 1 }) => {
  const canonicalName = String(name ?? '').trim().toLowerCase();
  const canonicalValue = String(value ?? '').trim();

  if (!canonicalName || !canonicalValue) return null;

  if (!forceHash(canonicalName) && STRUCTURAL_RAW_WHITELIST.has(canonicalName)) {
    return {
      name: canonicalName,
      valueKind: 'structural',
      value: canonicalValue.toLowerCase(),
      stabilityHint
    };
  }

  return {
    name: canonicalName,
    valueKind: 'hash',
    value: await sha256(canonicalValue.toLowerCase()),
    stabilityHint
  };
};

export const collectSemanticAttributes = async (element) => {
  const attributes = [];

  for (const attr of element.attributes ?? []) {
    if (!isSemanticAttribute(attr.name)) continue;
    const sanitized = await sanitizeAttribute({ name: attr.name, value: attr.value, stabilityHint: 1 });
    if (sanitized) attributes.push(sanitized);
  }

  return attributes;
};
