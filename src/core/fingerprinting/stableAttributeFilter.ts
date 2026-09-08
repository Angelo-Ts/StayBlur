import { sha256 } from './hash.js';

const STRUCTURAL_RAW_WHITELIST = new Set([
  'role',
  'type',
  'tag',
  'inputmode',
  'rel',
  'target'
]);

const NEVER_RAW_PATTERNS = [
  /^aria-label$/i,
  /^aria-description$/i,
  /^title$/i,
  /^placeholder$/i,
  /^value$/i,
  /^alt$/i,
  /^name$/i,
  /^data-/i,
  /^href$/i,
  /^src$/i
];

export interface RawAttributeInput {
  name: string;
  value: string;
  stabilityHint: number;
}

export interface SanitizedAttribute {
  name: string;
  valueKind: 'hash' | 'structural';
  value: string;
  stabilityHint: number;
}

const shouldForceHash = (name: string): boolean =>
  NEVER_RAW_PATTERNS.some((pattern) => pattern.test(name));

export const sanitizeAttribute = ({ name, value, stabilityHint }: RawAttributeInput): SanitizedAttribute => {
  const canonicalName = name.trim().toLowerCase();
  const canonicalValue = value.trim();

  if (!canonicalName || !canonicalValue) {
    throw new Error('Attribute name and value are required');
  }

  if (!shouldForceHash(canonicalName) && STRUCTURAL_RAW_WHITELIST.has(canonicalName)) {
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
    value: sha256(canonicalValue.toLowerCase()),
    stabilityHint
  };
};
