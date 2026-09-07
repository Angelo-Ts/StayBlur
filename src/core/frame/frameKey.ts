export interface FrameNodeDescriptor {
  id?: string;
  name?: string;
  tagName?: string;
  siblingIndex?: number;
}

/**
 * Builds a stable, non-sensitive key for a same-origin frame chain.
 *
 * The key intentionally uses DOM identity hints rather than the frame URL,
 * because URLs can contain volatile query parameters or tokens.
 */
export const buildFrameKey = (chain: FrameNodeDescriptor[]): string => {
  if (chain.length === 0) return 'top';

  const parts = chain.map((frame, depth) => {
    const tag = (frame.tagName ?? 'iframe').toLowerCase();
    const id = frame.id?.trim();
    const name = frame.name?.trim();
    const index = Number.isInteger(frame.siblingIndex) && (frame.siblingIndex as number) >= 0
      ? String(frame.siblingIndex)
      : '';

    if (id) return `${depth}:${tag}#${id}`;
    if (name) return `${depth}:${tag}[name=${name}]`;
    return `${depth}:${tag}[n=${index || '?'}]`;
  });

  return `frame:${parts.join('/')}`;
};
