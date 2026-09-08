export interface NormalizedTextResult {
  normalized: string;
  sourceLength: number;
  truncatedLength: number;
}

export const normalizeText = (value: string, maxLength = 256): NormalizedTextResult => {
  const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase();
  const truncated = normalized.slice(0, Math.max(maxLength, 0));

  return {
    normalized: truncated,
    sourceLength: normalized.length,
    truncatedLength: truncated.length
  };
};
