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
 *    - A frame is exactly 5 + CHANNEL_ID_LEN + sizeof(VALUE) bytes; LENGTH must match.
 * 
 * 2. Text mode fallback:
 *    "CH_NAME=VALUE;CH_NAME2=VALUE2\n"
 */

export const START_BYTE = 0xAA;
export const PROTO_MAGIC = 0x4144; // "AD"
export const PROTO_VERSION = 0x01;

/** Channel names travel in C strings and in the `name=value;` wire protocol, so they must be C identifiers. */
export const HIL_CHANNEL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,47}$/;

/** Maximum total size of a binary frame (the LENGTH field is a single byte). */
export const MAX_BINARY_FRAME_LENGTH = 255;
/** Smallest possible frame: START, LENGTH, ID_LEN, TYPE, 1B BOOL value, CHECKSUM. */
export const MIN_BINARY_FRAME_LENGTH = 6;

export enum ValueType {
  BOOL = 0x01,
  INT = 0x02,
  FLOAT = 0x03,
  DOUBLE = 0x04
}

export interface HILFrameHeader {
  magic: number;
  version: number;
  sequence: number;
  logicalTick: number;
  targetId: string;
  firmwareHash: string;
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
function valueSizeOf(type: number): number | null {
  if (type === ValueType.BOOL) return 1;
  if (type === ValueType.INT || type === ValueType.FLOAT) return 4;
  if (type === ValueType.DOUBLE) return 8;
  return null;
}

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
  if (length > MAX_BINARY_FRAME_LENGTH) {
    throw new Error(`Binary frame too long: ${length} bytes exceeds ${MAX_BINARY_FRAME_LENGTH}`);
  }
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
export function decodeBinaryFrame(buffer: Uint8Array): { channelId: string; value: number; length: number } | null {
  if (buffer.length < MIN_BINARY_FRAME_LENGTH) return null;
  if (buffer[0] !== START_BYTE) return null;

  const length = buffer[1];
  if (length < MIN_BINARY_FRAME_LENGTH || buffer.length < length) return null;

  const idLen = buffer[2];
  const typeOffset = 3 + idLen;
  if (typeOffset >= length) return null;

  const type = buffer[typeOffset];
  const valSize = valueSizeOf(type);
  if (valSize === null) return null;
  if (length !== 3 + idLen + 1 + valSize + 1) return null;

  const checksumOffset = length - 1;
  if (buffer[checksumOffset] !== calculateChecksum(buffer, 1, checksumOffset)) {
    return null;
  }

  const channelId = new TextDecoder().decode(buffer.subarray(3, 3 + idLen));
  const valueOffset = typeOffset + 1;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let value = 0;

  if (type === ValueType.BOOL) {
    value = view.getUint8(valueOffset);
  } else if (type === ValueType.INT) {
    value = view.getInt32(valueOffset, true);
  } else if (type === ValueType.FLOAT) {
    value = view.getFloat32(valueOffset, true);
  } else {
    value = view.getFloat64(valueOffset, true);
  }

  return { channelId, value, length };
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
