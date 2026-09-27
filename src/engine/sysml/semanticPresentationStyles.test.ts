import { describe, expect, it } from 'vitest';
import {
  elementPresentationColor,
  SEMANTIC_PRESENTATION_ROLES,
  SEMANTIC_PRESENTATION_ROLE_TOKENS,
  getSemanticPresentationStatusMeta,
  isValidPresentationColor,
  portKindToPresentationRole,
  resolveSemanticPresentation,
  semanticPresentationToken,
  semanticPresentationVariable,
} from './semanticPresentationStyles';

describe('semanticPresentationStyles role mapping (spec 3.5)', () => {
  it('maps every SemanticPresentationRole to exactly one CSS custom property', () => {
    expect(SEMANTIC_PRESENTATION_ROLES).toEqual([
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
    ]);

    const tokens = new Set<string>();
    for (const role of SEMANTIC_PRESENTATION_ROLES) {
      const token = semanticPresentationToken(role);
      expect(token).toMatch(/^var\(--sysml-sem-[a-z-]+\)$/);
      expect(SEMANTIC_PRESENTATION_ROLE_TOKENS[role]).toMatch(/^--sysml-sem-[a-z-]+$/);
      expect(token).toBe(`var(${SEMANTIC_PRESENTATION_ROLE_TOKENS[role]})`);
      tokens.add(token);
    }
    // One distinct custom property per role.
    expect(tokens.size).toBe(SEMANTIC_PRESENTATION_ROLES.length);
  });

  it('resolves unknown or absent roles deterministically without throwing', () => {
    const fallback = semanticPresentationToken('requirement');
    expect(semanticPresentationToken(undefined as never)).toBe(fallback);
    expect(semanticPresentationToken(null as never)).toBe(fallback);
    expect(semanticPresentationToken('' as never)).toBe(fallback);
    expect(semanticPresentationToken('not-a-role' as never)).toBe(fallback);
    // Deterministic across calls and independent of presentation identity.
    expect(semanticPresentationToken('not-a-role' as never)).toBe(
      semanticPresentationToken('not-a-role' as never),
    );
    expect(semanticPresentationVariable('mystery' as never)).toBe(
      semanticPresentationVariable('requirement'),
    );
  });

  it('overlays interaction state without changing the underlying role mapping', () => {
    expect(semanticPresentationToken('block', 'selected')).toBe(
      semanticPresentationToken('selection'),
    );
    expect(semanticPresentationToken('block', 'focused')).toBe(
      semanticPresentationToken('selection'),
    );
    expect(semanticPresentationToken('block', 'warning')).toBe(
      semanticPresentationToken('warning'),
    );
    expect(semanticPresentationToken('block', 'error')).toBe(
      semanticPresentationToken('error'),
    );
    expect(semanticPresentationToken('block', 'default')).toBe(
      semanticPresentationToken('block'),
    );
    expect(semanticPresentationToken('block', 'bogus' as never)).toBe(
      semanticPresentationToken('block'),
    );
  });

  it('maps legacy port kinds to presentation roles deterministically', () => {
    expect(portKindToPresentationRole('flow')).toBe('flowPort');
    expect(portKindToPresentationRole('proxy')).toBe('proxyPort');
    expect(portKindToPresentationRole('full')).toBe('fullPort');
    expect(portKindToPresentationRole('standard')).toBe('standardPort');
    expect(portKindToPresentationRole(undefined)).toBe('standardPort');
    expect(portKindToPresentationRole('mystery')).toBe('standardPort');
  });
});

describe('semanticPresentationStyles user overrides (spec 3.5)', () => {
  it('lets a valid user override win for presentation only', () => {
    const resolved = resolveSemanticPresentation('proxyPort', {
      customization: { color: '#123456' },
    });
    expect(resolved.role).toBe('proxyPort');
    expect(resolved.color).toBe('#123456');
    expect(resolved.isOverride).toBe(true);
    // The semantic role token is unchanged; only the presentation color wins.
    expect(resolved.token).toBe(semanticPresentationToken('proxyPort'));
    expect(resolved.variable).toBe(semanticPresentationVariable('proxyPort'));
  });

  it('ignores missing or invalid customizations and resolves the role default', () => {
    for (const customization of [
      undefined,
      null,
      {},
      { color: undefined },
      { color: '' },
      { color: '   ' },
      { color: 'not a color;;;' },
      { color: 'color: red; background: url(evil)' },
      { color: '#x' },
      { color: 'a'.repeat(65) },
    ]) {
      const resolved = resolveSemanticPresentation('fullPort', {
        customization: customization as never,
      });
      expect(resolved.role).toBe('fullPort');
      expect(resolved.color).toBe(semanticPresentationToken('fullPort'));
      expect(resolved.isOverride).toBe(false);
    }
  });

  it('accepts var(), hex, and functional color overrides', () => {
    expect(isValidPresentationColor('#abc')).toBe(true);
    expect(isValidPresentationColor('#a1b2c3')).toBe(true);
    expect(isValidPresentationColor('var(--my-custom)')).toBe(true);
    expect(isValidPresentationColor('rgb(10, 20, 30)')).toBe(true);
    expect(isValidPresentationColor('red')).toBe(false);
    expect(isValidPresentationColor('')).toBe(false);
    expect(isValidPresentationColor(null)).toBe(false);
  });

  it('never changes the semantic role and never leaks across diagrams', () => {
    const diagramA = resolveSemanticPresentation('state', {
      customization: { color: '#111111' },
      diagramId: 'diagram-a',
      presentationId: 'presentation-a',
    });
    const diagramB = resolveSemanticPresentation('state', {
      diagramId: 'diagram-b',
      presentationId: 'presentation-b',
    });
    expect(diagramA.role).toBe('state');
    expect(diagramA.color).toBe('#111111');
    expect(diagramB.role).toBe('state');
    expect(diagramB.color).toBe(semanticPresentationToken('state'));
    expect(diagramB.isOverride).toBe(false);
    // Resolving one presentation is pure: repeated resolution is stable.
    expect(resolveSemanticPresentation('state', { diagramId: 'diagram-b' })).toEqual(
      diagramB,
    );
  });

  it('keeps color out of semantic validation (resolver is pure presentation)', () => {
    const first = resolveSemanticPresentation('block', {
      customization: { color: '#222222' },
    });
    const second = resolveSemanticPresentation('block', {
      customization: { color: '#333333' },
    });
    expect(first.role).toBe(second.role);
    expect(first.token).toBe(second.token);
    expect(first.color).not.toBe(second.color);
  });
});

describe('elementPresentationColor stored overrides (review Finding 6a)', () => {
  const presentationsFor = (color: unknown) => ({
    bdd: { presentations: { 'rel-1': { style: { color } } } },
  });
  it('renders the stored override when valid and the role token when absent or invalid', () => {
    const token = semanticPresentationToken('validRequirementRelationship');
    expect(
      elementPresentationColor('validRequirementRelationship', 'bdd', 'rel-1', presentationsFor('#123456')),
    ).toBe('#123456');
    expect(
      elementPresentationColor('validRequirementRelationship', 'bdd', 'rel-1', presentationsFor(undefined)),
    ).toBe(token);
    expect(
      elementPresentationColor('validRequirementRelationship', 'bdd', 'rel-1', presentationsFor('not a color;;;')),
    ).toBe(token);
    expect(
      elementPresentationColor('validRequirementRelationship', 'bdd', 'rel-1', presentationsFor('')),
    ).toBe(token);
    // Overrides never leak across diagrams or elements.
    expect(
      elementPresentationColor('validRequirementRelationship', 'other', 'rel-1', presentationsFor('#123456')),
    ).toBe(token);
    expect(
      elementPresentationColor('validRequirementRelationship', 'bdd', 'rel-2', presentationsFor('#123456')),
    ).toBe(token);
    expect(
      elementPresentationColor('validRequirementRelationship', undefined, 'rel-1', presentationsFor('#123456')),
    ).toBe(token);
    expect(
      elementPresentationColor('proxyPort', 'bdd', 'rel-1', presentationsFor('var(--my-custom)')),
    ).toBe('var(--my-custom)');
  });
});

describe('elementPresentationColor status-role precedence (review follow-up)', () => {
  const presentationsFor = (color: unknown) => ({
    bdd: { presentations: { 'rel-1': { style: { color } } } },
  });
  it('ignores stored overrides for selection/error/warning roles and returns the role token', () => {
    for (const role of ['selection', 'error', 'warning'] as const) {
      const token = semanticPresentationToken(role);
      expect(
        elementPresentationColor(role, 'bdd', 'rel-1', presentationsFor('#123456')),
      ).toBe(token);
      expect(
        elementPresentationColor(role, 'bdd', 'rel-1', presentationsFor('var(--my-custom)')),
      ).toBe(token);
      expect(
        elementPresentationColor(role, 'bdd', 'rel-1', presentationsFor(undefined)),
      ).toBe(token);
    }
  });
  it('ignores stored overrides for base roles rendered in a status state', () => {
    expect(
      elementPresentationColor('block', 'bdd', 'rel-1', presentationsFor('#123456'), 'selected'),
    ).toBe(semanticPresentationToken('block', 'selected'));
    expect(
      elementPresentationColor('block', 'bdd', 'rel-1', presentationsFor('#123456'), 'error'),
    ).toBe(semanticPresentationToken('block', 'error'));
    expect(
      elementPresentationColor('block', 'bdd', 'rel-1', presentationsFor('#123456'), 'warning'),
    ).toBe(semanticPresentationToken('block', 'warning'));
  });
  it('still honors valid overrides for base semantic roles and rejects invalid ones', () => {
    const token = semanticPresentationToken('validRequirementRelationship');
    expect(
      elementPresentationColor('validRequirementRelationship', 'bdd', 'rel-1', presentationsFor('#123456')),
    ).toBe('#123456');
    expect(
      elementPresentationColor('validRequirementRelationship', 'bdd', 'rel-1', presentationsFor('not a color;;;')),
    ).toBe(token);
  });
});

describe('semanticPresentationStyles accessible status (spec 7)', () => {
  it('pairs warning/error tokens with text labels and icon names', () => {
    const warning = getSemanticPresentationStatusMeta('warning');
    const error = getSemanticPresentationStatusMeta('error');
    expect(warning).toMatchObject({
      label: expect.stringMatching(/warning/i),
      iconName: expect.any(String),
      token: semanticPresentationToken('warning'),
    });
    expect(error).toMatchObject({
      label: expect.stringMatching(/error/i),
      iconName: expect.any(String),
      token: semanticPresentationToken('error'),
    });
    expect(warning!.iconName).not.toBe(error!.iconName);
    expect(getSemanticPresentationStatusMeta('block')).toBeUndefined();
    expect(getSemanticPresentationStatusMeta('selection')).toBeUndefined();
  });
});
