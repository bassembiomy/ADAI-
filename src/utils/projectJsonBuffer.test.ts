import { describe, expect, it } from 'vitest';
import { parseProjectJsonBuffer } from './projectJsonBuffer';

describe('project JSON buffer desktop handoff', () => {
  it('preserves Unicode and nested project data while allowing queued input before handoff', async () => {
    const payload = { projectName: 'مشروع 🚀', states: [{ id: 'state', name: 'Active' }], sysmlRepository: { revision: 42 } };
    const buffer = new TextEncoder().encode(JSON.stringify(payload)).buffer;
    let servicedInput = false;
    setTimeout(() => { servicedInput = true; }, 0);
    const parsed = await parseProjectJsonBuffer(buffer);
    expect(parsed).toEqual(payload);
    expect(servicedInput).toBe(true);
  });

  it('rejects malformed JSON without publishing a partial project', async () => {
    const buffer = new TextEncoder().encode('{"states":').buffer;
    await expect(parseProjectJsonBuffer(buffer)).rejects.toBeInstanceOf(SyntaxError);
  });
});
