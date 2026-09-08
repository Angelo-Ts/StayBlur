export const normalizeText = (value, maxLength = 256) => {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const truncated = normalized.slice(0, Math.max(0, maxLength));

  return {
    normalized: truncated,
    sourceLength: normalized.length,
    truncatedLength: truncated.length
  };
};

export const isLikelyVolatileText = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return true;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) return true;
  if (/\b\d{1,3}%\b/.test(text)) return true;
  if (/\b\d{6,}\b/.test(text)) return true;
  if (/\b(updated|seconds?|minutes?)\b/i.test(text)) return true;
  return false;
};
