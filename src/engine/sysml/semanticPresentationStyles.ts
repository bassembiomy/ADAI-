/**
 * Task 6 centralized semantic presentation style resolver
 * (spec sections 3.5, 4.4, 7, 8).
 *
 * Color is presentation metadata and never controls semantic validation.
 * This module maps each {@link SemanticPresentationRole} to exactly one ADIA
 * design token (a CSS custom property), resolves per-presentation user
 * overrides without changing the semantic role, and pairs warning/error
 * status with accessible text/icon metadata (color is never the sole
 * indicator).
 *
 * Role vocabulary: the canonical `SemanticPresentationRole` /
 * `SemanticPresentationState` unions live in Task 1's
 * `src/components/sysml/typeSelectionTypes.ts` so tree and canvas
 * type-selection surfaces compile against one vocabulary. This module owns
 * the token resolver and re-exports those types for convenience; no token
 * accessor is duplicated elsewhere. All workflow surfaces (BDD/IBD port
 * symbols, tree glyphs, type dialogs, traceability controls,
 * previews/errors, committed projections) consume this resolver instead of
 * introducing hard-coded workflow colors.
 *
 * The resolver is pure: resolving one diagram/presentation never mutates
 * shared state and never affects another diagram's presentation.
 */
import type {
  SemanticPresentationRole as Task1SemanticPresentationRole,
  SemanticPresentationState as Task1SemanticPresentationState,
} from '../../components/sysml/typeSelectionTypes';

export type SemanticPresentationRole = Task1SemanticPresentationRole;
export type SemanticPresentationState = Task1SemanticPresentationState;

/** Every palette role in spec section 3.5 order. */
export const SEMANTIC_PRESENTATION_ROLES: readonly SemanticPresentationRole[] = [
  'block',
  'requirement',
  'state',
  'standardPort',
  'proxyPort',
  'fullPort',
  'flowPort',
  'validRequirementRelationship',
  'selection',
  'warning',
  'error',
] as const;

/**
 * Exactly one CSS custom property per role. Tokens are defined for both
 * light and dark themes in `src/index.css` and reuse existing ADIA palette
 * families (block blue, requirement neutral, state orange, port
 * blue/green/amber accents, requirement-relationship accent, application
 * orange/amber/red for selection/warning/error).
 */
export const SEMANTIC_PRESENTATION_ROLE_TOKENS: Record<
  SemanticPresentationRole,
  `--sysml-sem-${string}`
> = {
  block: '--sysml-sem-block',
  requirement: '--sysml-sem-requirement',
  state: '--sysml-sem-state',
  standardPort: '--sysml-sem-standard-port',
  proxyPort: '--sysml-sem-proxy-port',
  fullPort: '--sysml-sem-full-port',
  flowPort: '--sysml-sem-flow-port',
  validRequirementRelationship: '--sysml-sem-valid-requirement-relationship',
  selection: '--sysml-sem-selection',
  warning: '--sysml-sem-warning',
  error: '--sysml-sem-error',
};

/** Deterministic fallback for unknown/absent roles: neutral requirement. */
const FALLBACK_ROLE: SemanticPresentationRole = 'requirement';

const isKnownRole = (role: unknown): role is SemanticPresentationRole =>
  typeof role === 'string' &&
  (SEMANTIC_PRESENTATION_ROLES as readonly string[]).includes(role);

const normalizeRole = (role: unknown): SemanticPresentationRole =>
  isKnownRole(role) ? role : FALLBACK_ROLE;

/**
 * Bare CSS custom property name for a role, e.g. `--sysml-sem-block`.
 * Unknown/absent roles resolve deterministically to the fallback role.
 */
export function semanticPresentationVariable(
  role: unknown,
  state: unknown = 'default',
): `--sysml-sem-${string}` {
  const normalized = normalizeRole(role);
  if (state === 'selected' || state === 'focused') {
    return SEMANTIC_PRESENTATION_ROLE_TOKENS.selection;
  }
  if (state === 'warning') {
    return SEMANTIC_PRESENTATION_ROLE_TOKENS.warning;
  }
  if (state === 'error') {
    return SEMANTIC_PRESENTATION_ROLE_TOKENS.error;
  }
  return SEMANTIC_PRESENTATION_ROLE_TOKENS[normalized];
}

/**
 * Token reference for a role and optional interaction state, e.g.
 * `var(--sysml-sem-block)`. Selection/focus overlays resolve to the
 * application selection token; warning/error overlays resolve to the
 * corresponding status token. The underlying role mapping is unchanged.
 */
export function semanticPresentationToken(role: unknown, state: unknown = 'default'): string {
  return `var(${semanticPresentationVariable(role, state)})`;
}

/**
 * Legacy port `kind` values (`BlockData.ports[].kind` and canvas prompt
 * kinds) mapped onto presentation roles. Unknown/absent kinds resolve
 * deterministically to the Standard UML Port role; this never converts a
 * Standard Port into a ProxyPort or FullPort stereotype.
 */
export function portKindToPresentationRole(kind: unknown): SemanticPresentationRole {
  switch (kind) {
    case 'flow':
    case 'flowPort':
      return 'flowPort';
    case 'proxy':
    case 'proxyPort':
      return 'proxyPort';
    case 'full':
    case 'fullPort':
      return 'fullPort';
    case 'standard':
    case 'standardPort':
    case 'port':
    case 'umlPort':
      return 'standardPort';
    default:
      return 'standardPort';
  }
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const VAR_REFERENCE = /^var\(--[a-zA-Z0-9_-]+\)$/;
const FUNCTIONAL_COLOR =
  /^(?:rgb|rgba|hsl|hsla|color-mix|light-dark)\(\s*[^;{}<>!]*\s*\)$/;

/**
 * Whether a user-provided presentation color override is valid. Valid
 * overrides are preserved verbatim for presentation only. Anything else
 * (missing, blank, oversized, or containing declaration-breaking characters)
 * resolves to the role default. This check is purely presentational: it never
 * validates, admits, or rejects semantic content.
 */
export function isValidPresentationColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return false;
  if (/[;{}<>!]/.test(trimmed)) return false;
  return (
    HEX_COLOR.test(trimmed) || VAR_REFERENCE.test(trimmed) || FUNCTIONAL_COLOR.test(trimmed)
  );
}

export interface SemanticPresentationCustomization {
  color?: unknown;
}

export interface ResolveSemanticPresentationOptions {
  customization?: SemanticPresentationCustomization | null;
  state?: unknown;
  /** Diagram identity, accepted for per-presentation overrides; never changes the role. */
  diagramId?: string;
  /** Presentation identity, accepted for per-presentation overrides; never changes the role. */
  presentationId?: string;
}

export interface ResolvedSemanticPresentation {
  /** Semantic role; always the normalized requested role, never the override. */
  role: SemanticPresentationRole;
  /** Token reference, e.g. `var(--sysml-sem-proxy-port)`. */
  token: string;
  /** Bare custom property, e.g. `--sysml-sem-proxy-port`. */
  variable: `--sysml-sem-${string}`;
  /** Effective presentation color: valid override or role token. */
  color: string;
  isOverride: boolean;
}

/**
 * Resolve the effective presentation style for one semantic role in one
 * presentation. A valid user override wins for `color` only: `role`,
 * `token`, and `variable` always describe the requested semantic role, and
 * nothing is shared between diagrams or presentations.
 */
export function resolveSemanticPresentation(
  role: unknown,
  options: ResolveSemanticPresentationOptions = {},
): ResolvedSemanticPresentation {
  const normalized = normalizeRole(role);
  const state = options.state ?? 'default';
  const token = semanticPresentationToken(normalized, state);
  const variable = semanticPresentationVariable(normalized, state);
  const candidate = options.customization?.color;
  if (isValidPresentationColor(candidate)) {
    return { role: normalized, token, variable, color: candidate.trim(), isOverride: true };
  }
  return { role: normalized, token, variable, color: token, isOverride: false };
}

export interface SemanticPresentationStatusMeta {
  label: string;
  iconName: string;
  token: string;
  variable: `--sysml-sem-${string}`;
}

/**
 * Accessible non-color status metadata (spec section 7): warning/error
 * presentations always pair the token color with a text label and an icon
 * name so color is never the sole indicator. Returns `undefined` for
 * non-status roles.
 */
export function getSemanticPresentationStatusMeta(
  role: unknown,
): SemanticPresentationStatusMeta | undefined {
  if (role === 'warning') {
    return {
      label: 'Warning',
      iconName: 'alert-triangle',
      token: semanticPresentationToken('warning'),
      variable: semanticPresentationVariable('warning'),
    };
  }
  if (role === 'error') {
    return {
      label: 'Error',
      iconName: 'alert-circle',
      token: semanticPresentationToken('error'),
      variable: semanticPresentationVariable('error'),
    };
  }
  return undefined;
}
