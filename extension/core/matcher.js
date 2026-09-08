import { MATCHER_POLICY } from './constants.js';
import { filterStableTokens } from './dynamic-filter.js';
import { sanitizeAttribute } from './attributes.js';
import { normalizeText } from './text.js';
import { sha256 } from './hash.js';

const WEIGHTS = {
  stableId: 0.26,
  semanticAttributes: 0.22,
  textHash: 0.14,
  stableClasses: 0.12,
  ancestorContext: 0.1,
  structureContext: 0.08,
  cssSelector: 0.04,
  geometry: 0.02,
  tagName: 0.02
};

const INDEPENDENT_CATEGORIES = [
  'stableId',
  'semanticAttributes',
  'textHash',
  'stableClasses',
  'ancestorContext',
  'structureContext'
];

const clip01 = (value) => Math.min(1, Math.max(0, value));
const safeDivide = (num, den) => (den === 0 ? 0 : num / den);

const jaccard = (left, right) => {
  if (!left.length || !right.length) return 0;
  const lset = new Set(left);
  const rset = new Set(right);
  let intersection = 0;
  for (const item of lset) {
    if (rset.has(item)) intersection += 1;
  }
  const union = new Set([...lset, ...rset]).size;
  return safeDivide(intersection, union);
};

const collectRoots = (rootDocument) => {
  const roots = [rootDocument];

  const queue = [rootDocument];
  while (queue.length) {
    const root = queue.shift();
    const tree = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const el of tree) {
      if (el.shadowRoot && el.shadowRoot.mode === 'open') {
        roots.push(el.shadowRoot);
        queue.push(el.shadowRoot);
      }
    }
  }

  return roots;
};

const queryRoots = (roots, selector) => {
  const found = new Set();
  for (const root of roots) {
    if (!root.querySelectorAll) continue;
    for (const element of root.querySelectorAll(selector)) {
      found.add(element);
    }
  }
  return [...found];
};

const semanticKey = (item) => `${item.name}:${item.valueKind}`;

const extractSemanticAttributeMatches = async (element, referenceAttributes) => {
  const output = [];

  for (const reference of referenceAttributes) {
    const rawValue = element.getAttribute(reference.name);
    if (!rawValue) continue;

    if (reference.valueKind === 'structural') {
      output.push({
        name: reference.name,
        valueKind: 'structural',
        value: rawValue.toLowerCase()
      });
      continue;
    }

    const sanitized = await sanitizeAttribute({ name: reference.name, value: rawValue, stabilityHint: 1 });
    if (!sanitized) continue;
    output.push({
      name: sanitized.name,
      valueKind: sanitized.valueKind,
      value: sanitized.value
    });
  }

  return output;
};

const extractCandidateAncestorContext = async (element, depth) => {
  const chain = [];
  let current = element.parentElement;

  for (let i = 0; i < depth && current; i += 1) {
    const semanticAttrs = [];
    for (const attr of current.attributes ?? []) {
      if (!['role', 'type'].includes(attr.name.toLowerCase()) && !attr.name.toLowerCase().startsWith('aria-')) continue;
      const sanitized = await sanitizeAttribute({ name: attr.name, value: attr.value, stabilityHint: 1 });
      if (!sanitized) continue;
      semanticAttrs.push({ name: sanitized.name, valueKind: sanitized.valueKind, value: sanitized.value });
    }

    const classes = current.className ? String(current.className).split(/\s+/).filter(Boolean) : [];
    chain.push({
      tag: current.tagName.toLowerCase(),
      semanticAttrs,
      stableClasses: filterStableTokens(classes).stable
    });

    current = current.parentElement;
  }

  return { chain, depthCaptured: chain.length };
};

const extractCandidateStructure = (element) => {
  const parent = element.parentElement;
  const siblings = parent ? [...parent.children] : [];
  const index = siblings.indexOf(element);

  return {
    siblingSignature: {
      previousTag: index > 0 ? siblings[index - 1].tagName.toLowerCase() : undefined,
      nextTag: index >= 0 && index < siblings.length - 1 ? siblings[index + 1].tagName.toLowerCase() : undefined,
      indexWithinStableParent: index >= 0 ? index : undefined
    },
    childSignature: {
      stableChildTagsTopK: [...new Set([...element.children].slice(0, 5).map((child) => child.tagName.toLowerCase()))].slice(0, 3),
      stableChildRolesTopK: [...new Set([...element.children].slice(0, 5).map((child) => child.getAttribute('role')).filter(Boolean).map((v) => v.toLowerCase()))].slice(0, 3)
    }
  };
};

const extractCandidateGeometry = (element) => {
  const rect = element.getBoundingClientRect();
  const vw = Math.max(window.innerWidth, 1);
  const vh = Math.max(window.innerHeight, 1);

  return {
    viewportXRatio: clip01(rect.x / vw),
    viewportYRatio: clip01(rect.y / vh),
    widthRatio: clip01(rect.width / vw),
    heightRatio: clip01(rect.height / vh)
  };
};

export const buildCandidateSnapshot = async (element, fingerprint, cssSelectorMatched) => {
  const classes = element.className ? String(element.className).split(/\s+/).filter(Boolean) : [];
  const semanticAttributes = await extractSemanticAttributeMatches(element, fingerprint.semanticAttributes);

  const normalizedText = normalizeText(element.textContent ?? '');
  const normalizedTextHash = normalizedText.normalized ? await sha256(normalizedText.normalized) : undefined;

  return {
    element,
    candidateId: [element.tagName.toLowerCase(), element.id || '', classes.join('.'), element.outerHTML.length].join('|'),
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    semanticAttributes,
    classNames: filterStableTokens(classes).stable,
    normalizedTextHash,
    ancestorContext: await extractCandidateAncestorContext(element, fingerprint.ancestorContext.depthCaptured || 0),
    structureContext: extractCandidateStructure(element),
    geometricHint: extractCandidateGeometry(element),
    cssSelectorMatched
  };
};

const scoreStableId = (fingerprint, candidate) => {
  if (!fingerprint.stableId || !candidate.id) return { score: 0, available: false };
  return { score: candidate.id === fingerprint.stableId.value ? 1 : 0, available: true };
};

const scoreSemantic = (fingerprint, candidate) => {
  if (!fingerprint.semanticAttributes.length || !candidate.semanticAttributes.length) return { score: 0, available: false };

  const map = new Map(candidate.semanticAttributes.map((item) => [semanticKey(item), item.value]));
  let numerator = 0;
  let denominator = 0;

  for (const attr of fingerprint.semanticAttributes) {
    denominator += attr.stabilityHint;
    if (map.get(semanticKey(attr)) === attr.value) numerator += attr.stabilityHint;
  }

  return { score: clip01(safeDivide(numerator, denominator)), available: denominator > 0 };
};

const scoreTextHash = (fingerprint, candidate) => {
  if (!fingerprint.normalizedTextHash?.stable || !candidate.normalizedTextHash) return { score: 0, available: false };
  return { score: candidate.normalizedTextHash === fingerprint.normalizedTextHash.hash ? 1 : 0, available: true };
};

const scoreStableClasses = (fingerprint, candidate) => {
  if (!fingerprint.stableClasses.length || !candidate.classNames.length) return { score: 0, available: false };
  return {
    score: clip01(jaccard(fingerprint.stableClasses.map((item) => item.className), candidate.classNames)),
    available: true
  };
};

const scoreAncestorContext = (fingerprint, candidate) => {
  const left = fingerprint.ancestorContext.chain;
  const right = candidate.ancestorContext.chain;
  if (!left.length || !right.length) return { score: 0, available: false };

  const count = Math.min(left.length, right.length);
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const l = left[i];
    const r = right[i];
    const tagScore = l.tag === r.tag ? 1 : 0;
    const attrScore = jaccard(
      l.semanticAttrs.map((a) => `${a.name}:${a.valueKind}:${a.value}`),
      r.semanticAttrs.map((a) => `${a.name}:${a.valueKind}:${a.value}`)
    );
    const classScore = jaccard(l.stableClasses, r.stableClasses);
    total += clip01(0.5 * tagScore + 0.3 * attrScore + 0.2 * classScore);
  }

  return { score: clip01(safeDivide(total, count)), available: true };
};

const scoreStructureContext = (fingerprint, candidate) => {
  const scores = [];
  const fS = fingerprint.structureContext.siblingSignature;
  const cS = candidate.structureContext.siblingSignature;
  const fC = fingerprint.structureContext.childSignature;
  const cC = candidate.structureContext.childSignature;

  if (fS && cS) {
    if (fS.previousTag) scores.push(fS.previousTag === cS.previousTag ? 1 : 0);
    if (fS.nextTag) scores.push(fS.nextTag === cS.nextTag ? 1 : 0);
    if (Number.isInteger(fS.indexWithinStableParent) && Number.isInteger(cS.indexWithinStableParent)) {
      scores.push(fS.indexWithinStableParent === cS.indexWithinStableParent ? 1 : 0);
    }
  }

  if (fC && cC) {
    scores.push(jaccard(fC.stableChildTagsTopK ?? [], cC.stableChildTagsTopK ?? []));
    scores.push(jaccard(fC.stableChildRolesTopK ?? [], cC.stableChildRolesTopK ?? []));
  }

  if (!scores.length) return { score: 0, available: false };
  return { score: clip01(scores.reduce((sum, item) => sum + item, 0) / scores.length), available: true };
};

const scoreCssSelector = (candidate) => ({ score: candidate.cssSelectorMatched ? 1 : 0, available: true });

const scoreGeometry = (fingerprint, candidate) => {
  if (!fingerprint.geometricHint || !candidate.geometricHint) return { score: 0, available: false };
  const keys = ['viewportXRatio', 'viewportYRatio', 'widthRatio', 'heightRatio'];
  const averageDelta = keys.reduce((sum, key) => sum + Math.abs(fingerprint.geometricHint[key] - candidate.geometricHint[key]), 0) / keys.length;
  return { score: clip01(1 - averageDelta), available: true };
};

const scoreTagName = (fingerprint, candidate) => ({
  score: fingerprint.tagName === candidate.tagName ? 1 : 0,
  available: true
});

const scoreCandidate = (fingerprint, candidate) => {
  const breakdown = {
    stableId: scoreStableId(fingerprint, candidate),
    semanticAttributes: scoreSemantic(fingerprint, candidate),
    textHash: scoreTextHash(fingerprint, candidate),
    stableClasses: scoreStableClasses(fingerprint, candidate),
    ancestorContext: scoreAncestorContext(fingerprint, candidate),
    structureContext: scoreStructureContext(fingerprint, candidate),
    cssSelector: scoreCssSelector(candidate),
    geometry: scoreGeometry(fingerprint, candidate),
    tagName: scoreTagName(fingerprint, candidate)
  };

  let weighted = 0;
  let availableWeight = 0;

  for (const [category, result] of Object.entries(breakdown)) {
    if (!result.available) continue;
    weighted += WEIGHTS[category] * result.score;
    availableWeight += WEIGHTS[category];
  }

  const totalScore = availableWeight > 0 ? clip01(weighted / availableWeight) : 0;
  const independentContributions = INDEPENDENT_CATEGORIES.filter(
    (category) => breakdown[category].available && breakdown[category].score >= MATCHER_POLICY.minCategoryContribution
  ).length;

  return {
    ...candidate,
    totalScore,
    independentContributions,
    breakdown
  };
};

const compareScore = (left, right) => {
  if (left.totalScore !== right.totalScore) return right.totalScore - left.totalScore;
  if (left.independentContributions !== right.independentContributions) {
    return right.independentContributions - left.independentContributions;
  }
  if (left.breakdown.semanticAttributes.score !== right.breakdown.semanticAttributes.score) {
    return right.breakdown.semanticAttributes.score - left.breakdown.semanticAttributes.score;
  }
  return left.candidateId.localeCompare(right.candidateId);
};

export const decideBestMatch = (rule, rankedCandidates, policy = MATCHER_POLICY) => {
  if (!rule.enabled) {
    return { status: 'disabled', reason: 'rule-disabled', confidence: 0 };
  }

  const c1 = rankedCandidates[0];
  const c2 = rankedCandidates[1];

  if (!c1 || c1.totalScore < policy.ambiguousThreshold) {
    return { status: 'notFound', reason: 'below-ambiguous-threshold', selectedCandidate: c1, confidence: c1?.totalScore ?? 0 };
  }

  if (c1.totalScore < policy.autoApplyThreshold) {
    return { status: 'ambiguous', reason: 'between-thresholds', selectedCandidate: c1, confidence: c1.totalScore };
  }

  if (c1.independentContributions < policy.minIndependentCategories) {
    return {
      status: 'ambiguous',
      reason: 'insufficient-independent-categories',
      selectedCandidate: c1,
      confidence: c1.totalScore
    };
  }

  if (Math.abs(c1.totalScore - (c2?.totalScore ?? 0)) <= policy.topGapAmbiguousDelta) {
    return { status: 'ambiguous', reason: 'top-candidates-too-close', selectedCandidate: c1, confidence: c1.totalScore };
  }

  return { status: 'active', reason: 'safe-auto-apply', selectedCandidate: c1, confidence: c1.totalScore };
};

const findCandidatesForRule = (rule, roots) => {
  const set = new Set();
  const cssMatched = new WeakSet();

  if (rule.fingerprint.cssSelector) {
    for (const el of queryRoots(roots, rule.fingerprint.cssSelector)) {
      set.add(el);
      cssMatched.add(el);
    }
  }

  if (rule.fingerprint.stableId?.value) {
    const escaped = CSS.escape(rule.fingerprint.stableId.value);
    for (const el of queryRoots(roots, `#${escaped}`)) {
      set.add(el);
    }
  }

  for (const attr of rule.fingerprint.semanticAttributes) {
    if (attr.valueKind !== 'structural') continue;
    const escapedValue = CSS.escape(attr.value);
    for (const el of queryRoots(roots, `[${attr.name}="${escapedValue}"]`)) {
      set.add(el);
    }
  }

  if (set.size === 0) {
    for (const el of queryRoots(roots, rule.fingerprint.tagName)) {
      set.add(el);
      if (set.size >= 200) break;
    }
  }

  return {
    candidates: [...set],
    isCssMatched: (element) => cssMatched.has(element)
  };
};

export const matchRuleOnDocument = async (rule, rootDocument = document, rootsOverride) => {
  const roots = rootsOverride?.length ? rootsOverride : collectRoots(rootDocument);
  const { candidates, isCssMatched } = findCandidatesForRule(rule, roots);
  const snapshots = await Promise.all(candidates.map((el) => buildCandidateSnapshot(el, rule.fingerprint, isCssMatched(el))));
  const ranked = snapshots.map((candidate) => scoreCandidate(rule.fingerprint, candidate)).sort(compareScore);
  const decision = decideBestMatch(rule, ranked);

  return {
    ranked,
    decision,
    c1: ranked[0],
    c2: ranked[1]
  };
};

export const matcherInternals = {
  WEIGHTS,
  INDEPENDENT_CATEGORIES,
  scoreCandidate,
  collectRoots
};
