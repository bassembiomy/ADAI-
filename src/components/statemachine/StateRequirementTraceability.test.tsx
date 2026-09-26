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
});
