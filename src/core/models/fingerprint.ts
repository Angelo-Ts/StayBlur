export type SemanticValueKind = 'hash' | 'structural';

export interface StableIdFingerprint {
  value: string;
  confidenceHint: number;
}

export interface SemanticAttributeFingerprint {
  name: string;
  valueKind: SemanticValueKind;
  value: string;
  stabilityHint: number;
}

export interface StableClassFingerprint {
  className: string;
  stabilityHint: number;
}

export interface NormalizedTextHashFingerprint {
  algorithm: 'SHA-256';
  hash: string;
  sourceLength: number;
  truncatedLength: number;
  stable: boolean;
}

export interface AncestorNodeFingerprint {
  tag: string;
  semanticAttrs: Array<Pick<SemanticAttributeFingerprint, 'name' | 'valueKind' | 'value'>>;
  stableClasses: string[];
}

export interface Fingerprint {
  generatedAt: string;
  generationVersion: '1.5';
  cssSelector?: string;
  stableId?: StableIdFingerprint;
  semanticAttributes: SemanticAttributeFingerprint[];
  stableClasses: StableClassFingerprint[];
  normalizedTextHash?: NormalizedTextHashFingerprint;
  ancestorContext: {
    chain: AncestorNodeFingerprint[];
    depthCaptured: number;
  };
  structureContext: {
    siblingSignature?: {
      previousTag?: string;
      nextTag?: string;
      indexWithinStableParent?: number;
    };
    childSignature?: {
      stableChildTagsTopK: string[];
      stableChildRolesTopK: string[];
    };
  };
  geometricHint?: {
    viewportXRatio: number;
    viewportYRatio: number;
    widthRatio: number;
    heightRatio: number;
  };
  tagName: string;
  excludedSignals: {
    droppedDynamicIds: string[];
    droppedDynamicClasses: string[];
    droppedVolatileText: boolean;
  };
}
