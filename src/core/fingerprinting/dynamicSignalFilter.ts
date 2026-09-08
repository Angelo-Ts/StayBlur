const GUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const LONG_HEX_PATTERN = /^[a-f0-9]{10,}$/i;
const MIXED_HASH_PATTERN = /[a-z0-9]*[a-f][0-9][a-f0-9]{6,}/i;
const TIMESTAMP_SUFFIX_PATTERN = /(\d{9,}|\d{4,}_\d{4,})$/;

export const isLikelyDynamicToken = (value: string): boolean => {
  if (!value) return true;
  if (GUID_PATTERN.test(value)) return true;
  if (LONG_HEX_PATTERN.test(value)) return true;
  if (TIMESTAMP_SUFFIX_PATTERN.test(value)) return true;

  const chunks = value.split(/[-_]/).filter(Boolean);
  return chunks.some((chunk) => chunk.length >= 8 && MIXED_HASH_PATTERN.test(chunk));
};

export const filterStableTokens = (tokens: string[]): { stable: string[]; dropped: string[] } => {
  const stable: string[] = [];
  const dropped: string[] = [];

  for (const token of tokens) {
    if (isLikelyDynamicToken(token)) {
      dropped.push(token);
      continue;
    }

    stable.push(token);
  }

  return { stable, dropped };
};
