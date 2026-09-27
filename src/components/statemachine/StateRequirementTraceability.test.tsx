// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StateRequirementTraceability } from './StateRequirementTraceability';
import type { SysmlRepository } from '../../engine/sysml/model';
import { createEmptyRepository } from '../../engine/sysml/model';

describe('StateRequirementTraceability component', () => {
  afterEach(() => {
    cleanup();
  });
  const mockRepo = (): SysmlRepository => {
    const repo = createEmptyRepository();
    repo.requirements['req-safety'] = {
      id: 'req-safety',
      requirementId: 'REQ-001',
      name: 'Safety Interlock',
      kind: 'requirement',
      ownerId: 'pkg-reqs',
      namespace: [],
      text: 'The system shall safely disengage in fault states.',
      status: 'approved',
      version: '1.0',
    };
    repo.requirements['req-timing'] = {
      id: 'req-timing',
      requirementId: 'REQ-002',
      name: 'Max Latency 10ms',
      kind: 'requirement',
      ownerId: 'pkg-reqs',
      namespace: [],
      text: 'State transitions shall complete within 10ms.',
      status: 'approved',
      version: '1.0',
    };
    repo.relationships['rel-1'] = {
      id: 'rel-1',
      kind: 'satisfy',
      sourceId: 'state-emergency',
      targetId: 'req-safety',
    };
    return repo;
  };

  it('renders existing traceability links for the active state', () => {
    const repo = mockRepo();
    const onLink = vi.fn();
    const onUnlink = vi.fn();

    render(
      <StateRequirementTraceability
        stateId="state-emergency"
        stateName="EmergencyStop"
        canonicalRepository={repo}
        onLinkRequirement={onLink}
        onUnlinkRelationship={onUnlink}
      />
    );

    expect(screen.getByText('Requirement Traceability')).toBeDefined();
    expect(screen.getByText(/Safety Interlock/)).toBeDefined();
    expect(screen.getAllByText('«satisfy»').length).toBeGreaterThan(0);
  });

  it('calls onLinkRequirement when a requirement is selected and linked', () => {
    const repo = mockRepo();
    const onLink = vi.fn();
    const onUnlink = vi.fn();

    render(
      <StateRequirementTraceability
        stateId="state-emergency"
        stateName="EmergencyStop"
        canonicalRepository={repo}
        onLinkRequirement={onLink}
        onUnlinkRelationship={onUnlink}
      />
    );

    const selectRequirement = screen.getByLabelText(/Select Requirement/i);
    fireEvent.change(selectRequirement, { target: { value: 'req-timing' } });

    const selectKind = screen.getByLabelText(/Relationship Kind/i);
    fireEvent.change(selectKind, { target: { value: 'verify' } });

    const linkButton = screen.getByRole('button', { name: /Add Trace Link/i });
    fireEvent.click(linkButton);

    expect(onLink).toHaveBeenCalledWith('req-timing', 'verify');
  });

  it('calls onUnlinkRelationship when unlink button is clicked', () => {
    const repo = mockRepo();
    const onLink = vi.fn();
    const onUnlink = vi.fn();

    render(
      <StateRequirementTraceability
        stateId="state-emergency"
        stateName="EmergencyStop"
        canonicalRepository={repo}
        onLinkRequirement={onLink}
        onUnlinkRelationship={onUnlink}
      />
    );

    const unlinkButton = screen.getByTitle(/Unlink Safety Interlock/i);
    fireEvent.click(unlinkButton);

    expect(onUnlink).toHaveBeenCalledWith('rel-1');
  });

  it('projects committed links with the centralized requirement-relationship token', () => {
    const repo = mockRepo();
    render(
      <StateRequirementTraceability
        stateId="state-emergency"
        stateName="EmergencyStop"
        canonicalRepository={repo}
        onLinkRequirement={vi.fn()}
        onUnlinkRelationship={vi.fn()}
      />
    );

    const badge = screen.getAllByText('«satisfy»')[0];
    // The «kind» text is the non-color indicator; the color resolves from the
    // centralized palette role instead of a hard-coded workflow color.
    expect(badge.textContent).toContain('satisfy');
    expect(badge.getAttribute('style') ?? '').toContain('--sysml-sem-valid-requirement-relationship');
  });

  it('exposes the unlink control under an accessible name', () => {
    const repo = mockRepo();
    render(
      <StateRequirementTraceability
        stateId="state-emergency"
        stateName="EmergencyStop"
        canonicalRepository={repo}
        onLinkRequirement={vi.fn()}
        onUnlinkRelationship={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: /Unlink Safety Interlock/i }),
    ).toBeDefined();
  });

  it('pairs the empty-repository warning token with a text label and accessible name', () => {
    const repo = createEmptyRepository();
    render(
      <StateRequirementTraceability
        stateId="state-emergency"
        stateName="EmergencyStop"
        canonicalRepository={repo}
        onLinkRequirement={vi.fn()}
        onUnlinkRelationship={vi.fn()}
      />
    );

    const warning = screen.getByRole('status');
    expect(warning.getAttribute('aria-label') ?? '').toMatch(/warning/i);
    expect(warning.textContent ?? '').toMatch(/warning/i);
    expect(warning.getAttribute('style') ?? '').toContain('--sysml-sem-warning');
  });

  it('surfaces dangling trace links as an error with icon, label, and token', () => {
    const repo = createEmptyRepository();
    repo.relationships['rel-dangling'] = {
      id: 'rel-dangling',
      kind: 'satisfy',
      sourceId: 'state-emergency',
      targetId: 'req-missing',
    };
    render(
      <StateRequirementTraceability
        stateId="state-emergency"
        stateName="EmergencyStop"
        canonicalRepository={repo}
        onLinkRequirement={vi.fn()}
        onUnlinkRelationship={vi.fn()}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('aria-label') ?? '').toMatch(/error/i);
    expect(alert.textContent ?? '').toMatch(/error/i);
    expect(alert.getAttribute('style') ?? '').toContain('--sysml-sem-error');
  });
});
