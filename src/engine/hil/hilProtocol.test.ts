import { describe, it, expect } from 'vitest';
import { decodeBinaryFrame, encodeBinaryFrame, START_BYTE } from './hilProtocol';

describe('hilProtocol binary framing', () => {
  it('round-trips every value type and reports the frame length', () => {
    const cases: Array<[string, number, string, number]> = [
      ['b', 1, 'bool', 1],
      ['i', -42, 'int32_t', -42],
      ['f', 1.5, 'float', 1.5],
      ['d', 2.25, 'double', 2.25],
    ];
    for (const [id, value, type, expected] of cases) {
      const frame = encodeBinaryFrame(id, value, type);
      const decoded = decodeBinaryFrame(frame);
      expect(decoded).not.toBeNull();
      expect(decoded!.channelId).toBe(id);
      expect(decoded!.value).toBe(expected);
      expect(decoded!.length).toBe(frame.length);
    }
  });

  it('decodes the 6-byte minimum frame', () => {
    const frame = encodeBinaryFrame('', 1, 'bool');
    expect(frame.length).toBe(6);
    expect(decodeBinaryFrame(frame)).toMatchObject({ channelId: '', value: 1, length: 6 });
  });

  it('returns null (never throws) for malformed frames', () => {
    const bad = new Uint8Array([START_BYTE, 0x05, 0x00, 0x04, 0x09, 0, 0, 0, 0, 0]);
    expect(() => decodeBinaryFrame(bad)).not.toThrow();
    expect(decodeBinaryFrame(bad)).toBeNull();
    // unknown type with otherwise consistent length and checksum
    const unknown = new Uint8Array([START_BYTE, 0x06, 0x00, 0x09, 0x01, 0x10]);
    expect(decodeBinaryFrame(unknown)).toBeNull();
    // length byte larger than the buffer
    expect(decodeBinaryFrame(new Uint8Array([START_BYTE, 0xFF, 0x00, 0x01, 0x01, 0x03]))).toBeNull();
    // id length larger than the frame
    expect(decodeBinaryFrame(new Uint8Array([START_BYTE, 0x06, 0xFF, 0x01, 0x01, 0x03]))).toBeNull();
  });

  it('rejects a frame whose length byte disagrees with its type', () => {
    const frame = encodeBinaryFrame('x', 1, 'double');
    const tampered = new Uint8Array(frame);
    tampered[3 + 1] = 0x01; // type -> BOOL but length still describes a double
    expect(decodeBinaryFrame(tampered)).toBeNull();
  });

  it('throws when the frame would exceed 255 bytes', () => {
    expect(() => encodeBinaryFrame('x'.repeat(260), 1, 'float')).toThrow();
    expect(() => encodeBinaryFrame('x'.repeat(248), 1, 'double')).toThrow();
    expect(() => encodeBinaryFrame('x'.repeat(200), 1, 'double')).not.toThrow();
  });
});
