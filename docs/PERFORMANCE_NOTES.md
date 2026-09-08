# Performance notes

## Current runtime strategy

- Shadow-root style discovery is mutation-local rather than rescanning the whole document after every mutation.
- The matcher prioritizes stable IDs and structural semantic attributes before broad CSS-selector discovery.
- CSS-selector candidates are capped to avoid a very broad selector monopolizing the candidate budget.
- Semantic attribute fingerprints are cached per element with a mutation-sensitive attribute signature.

## Safety invariant

Performance optimizations must not weaken the safety gate: automatic application still requires high confidence, at least three independent identifying categories, and no near-tied top candidate.

## Next targets

1. Make runtime matcher candidate discovery incremental instead of rebuilding large candidate sets.
2. Reduce repeated layout reads during scoring.
3. Add targeted performance tests around large DOMs and mutation bursts.
4. Keep false positives unacceptable: optimize false negatives only when the safety decision is unchanged.
