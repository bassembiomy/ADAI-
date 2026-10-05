// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SysmlRelationship } from '../../engine/sysml/model';
import { RelationshipEndEditor } from './RelationshipEndEditor';

const relationship: SysmlRelationship = {
  id: 'rel1', kind: 'composition', sourceId: 'blockA', targetId: 'blockB', sourceRole: 'whole', targetRole: 'part',
  sourceMultiplicity: { lower: 0, upper: 1, ordered: false, unique: true },
  targetMultiplicity: { lower: 1, upper: '*', ordered: false, unique: true },
  sourceNavigable: false, targetNavigable: true, sourceAggregation: 'composite', targetAggregation: 'none',
};

describe('RelationshipEndEditor draft fields', () => {
  afterEach(cleanup);

  it('commits once when Enter is followed by a blur', () => {
    const onChange = vi.fn();
    render(<RelationshipEndEditor relationship={relationship} diagram="bdd" onChange={onChange} />);
    const input = screen.getByLabelText('Source role name');
    fireEvent.change(input, { target: { value: '  owner  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ sourceRole: 'owner' });
  });

  it('commits again after the draft is edited further', () => {
    const onChange = vi.fn();
    render(<RelationshipEndEditor relationship={relationship} diagram="bdd" onChange={onChange} />);
    const input = screen.getByLabelText('Source role name');
    fireEvent.change(input, { target: { value: 'owner' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'boss' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
