/**
 * HIL Communication Protocol
 * Handles encoding/decoding of signal values for serial exchange.
 * 
 * Protocol Formats:
 * 
 * 1. Binary frame format (little-endian):
 *    [START_BYTE(0xAA)][LENGTH(1B)][CHANNEL_ID_LEN(1B)][CHANNEL_ID_STR][VALUE_TYPE(1B)][VALUE_BYTES(1B/4B/8B)][CHECKSUM(1B)]
 *    - START_BYTE: 0xAA sentinel.
 *    - LENGTH: Total frame size (includes all bytes from START_BYTE to CHECKSUM).
 *    - CHANNEL_ID_LEN: Number of bytes in channel ID string.
 *    - CHANNEL_ID_STR: UTF-8 encoded channel ID string.
 *    - VALUE_TYPE: Type discriminator (0x01: BOOL, 0x02: INT, 0x03: FLOAT, 0x04: DOUBLE).
 *    - VALUE_BYTES: Binary payload (1 byte for BOOL, 4 bytes for INT/FLOAT, 8 bytes for DOUBLE).
 *    - CHECKSUM: Simple 8-bit sum modulo 256 of all bytes starting from LENGTH up to VALUE_BYTES (skips START_BYTE).
 * 
 * 2. Text mode fallback:
 *    "CH_NAME=VALUE;CH_NAME2=VALUE2\n"
 */

export const START_BYTE = 0xAA;

export enum ValueType {
  BOOL = 0x01,
  INT = 0x02,
  FLOAT = 0x03,
  DOUBLE = 0x04
}

// Map JavaScript/C types to protocol value types
export function getProtoType(cType: string): ValueType {
  if (cType === 'bool') return ValueType.BOOL;
  if (cType.startsWith('int') || cType.startsWith('uint')) return ValueType.INT;
  if (cType === 'float') return ValueType.FLOAT;
  return ValueType.DOUBLE;
}

/**
 * Calculates simple checksum (sum of bytes modulo 256)
 */
function calculateChecksum(bytes: Uint8Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) {
    sum = (sum + bytes[i]) & 0xFF;
  }
  return sum;
}

/**
 * Encodes a single channel value into a binary frame
 */
export function encodeBinaryFrame(channelId: string, value: number, dataType: string): Uint8Array {
  const encoder = new TextEncoder();
  const idBytes = encoder.encode(channelId);
  const type = getProtoType(dataType);
  
  // Header: START(1B) + LENGTH(1B) + ID_LEN(1B) + ID_BYTES + TYPE(1B) + VAL_BYTES + CHECKSUM(1B)
  const valSize = type === ValueType.DOUBLE ? 8 : (type === ValueType.BOOL ? 1 : 4);
  const length = 1 + 1 + 1 + idBytes.length + 1 + valSize + 1;
  const buffer = new Uint8Array(length);
  
  let offset = 0;
  buffer[offset++] = START_BYTE;
  buffer[offset++] = length;
  buffer[offset++] = idBytes.length;
  buffer.set(idBytes, offset);
  offset += idBytes.length;
  buffer[offset++] = type;
  
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (type === ValueType.BOOL) {
    view.setUint8(offset, value ? 1 : 0);
    offset += 1;
  } else if (type === ValueType.INT) {
    view.setInt32(offset, value, true); // little endian
    offset += 4;
  } else if (type === ValueType.FLOAT) {
    view.setFloat32(offset, value, true);
    offset += 4;
  } else {
    view.setFloat64(offset, value, true);
    offset += 8;
  }
  
  if (offset !== length - 1) {
    throw new Error(`Frame construction offset mismatch: expected ${length - 1}, got ${offset}`);
  }
  
  buffer[offset] = calculateChecksum(buffer, 1, offset);
  return buffer;
}

/**
 * Decodes a binary frame into its components
 */
export function decodeBinaryFrame(buffer: Uint8Array): { channelId: string; value: number } | null {
  if (buffer.length < 7) return null;
  if (buffer[0] !== START_BYTE) return null;
  
  const length = buffer[1];
  if (buffer.length < length) return null;
  
  const idLen = buffer[2];
  if (3 + idLen + 2 > length) return null;
  
  const idBytes = buffer.subarray(3, 3 + idLen);
  const channelId = new TextDecoder().decode(idBytes);
  
  let offset = 3 + idLen;
  const type = buffer[offset++];
  
  const checksumOffset = length - 1;
  const calcChecksum = calculateChecksum(buffer, 1, checksumOffset);
  if (buffer[checksumOffset] !== calcChecksum) {
    // Checksum mismatch
    return null;
  }
  
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let value = 0;
  
  if (type === ValueType.BOOL) {
    value = view.getUint8(offset);
  } else if (type === ValueType.INT) {
    value = view.getInt32(offset, true);
  } else if (type === ValueType.FLOAT) {
    value = view.getFloat32(offset, true);
  } else if (type === ValueType.DOUBLE) {
    value = view.getFloat64(offset, true);
  }
  
  return { channelId, value };
}

/**
 * Encodes multiple channel values into a combined text frame.
 * Example format: "CH1=23.4;CH2=1;CH3=0\n"
 */
export function encodeTextFrame(channelValues: Record<string, number>): string {
  const parts = Object.entries(channelValues).map(([id, val]) => `${id}=${val.toFixed(4)}`);
  return parts.join(';') + '\n';
}

/**
 * Decodes a text frame.
 * Example input: "CH1=23.4;CH2=1.0;CH3=0"
 */
export function decodeTextFrame(line: string): Record<string, number> {
  const result: Record<string, number> = {};
  const cleaned = line.trim();
  if (!cleaned) return result;
  
  const parts = cleaned.split(';');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx !== -1) {
      const id = part.substring(0, eqIdx).trim();
      const valStr = part.substring(eqIdx + 1).trim();
      const val = parseFloat(valStr);
      if (!isNaN(val) && id && id.length > 0) {
        result[id] = val;
      }
    }
  }
  return result;
}
