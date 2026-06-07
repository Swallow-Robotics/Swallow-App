/**
 * MAVLink telemetry over Web Serial API.
 * Runs a background read loop from a serial port (e.g. telemetry radio),
 * parses MAVLink v1 and v2 packets and invokes onMessage for each decoded message.
 *
 * Receiving uses the hand-written decoders below for common-dialect telemetry
 * (HEARTBEAT, GPS, etc.) plus a table-driven decoder for the Skyer custom
 * dialect. Sending is table-driven too: encodeMavlinkMessage() builds a v2
 * frame from the generated dialect definitions (offsets + CRC_EXTRA), so the
 * custom messages stay in sync with the drone firmware via codegen.
 *
 * Requires: user gesture to call requestAndConnect() (browser security).
 * Supported in Chrome/Edge (Web Serial API).
 */

import { MESSAGES, MESSAGES_BY_ID } from './mavlinkDialect.generated';

const MAVLINK_STX_V1 = 0xfe;
const MAVLINK_STX_V2 = 0xfd;

// GCS defaults (MAVLink convention for a ground station / companion sender).
const DEFAULT_SYSTEM_ID = 255;
const DEFAULT_COMPONENT_ID = 190;

// Base C type -> byte size, for table-driven encode/decode of the dialect.
const TYPE_SIZE = {
  char: 1,
  int8_t: 1,
  uint8_t: 1,
  int16_t: 2,
  uint16_t: 2,
  int32_t: 4,
  uint32_t: 4,
  int64_t: 8,
  uint64_t: 8,
  float: 4,
  double: 8,
};

// MAVLink v1 header: STX(1) + len(1) + seq(1) + sysid(1) + compid(1) + msgid(1) = 6
const V1_HEADER_LEN = 6;
// MAVLink v2 header: STX(1) + len(1) + incompat(1) + compat(1) + seq(1) + sysid(1) + compid(1) + msgid(3) = 10
const V2_HEADER_LEN = 10;

// Common message IDs (MAVLink common.xml)
export const MAV_MSG = {
  HEARTBEAT: 0,
  SYS_STATUS: 1,
  GPS_RAW_INT: 24,
  ATTITUDE: 30,
  GLOBAL_POSITION_INT: 33,
  VFR_HUD: 74,
  STATUSTEXT: 253,
};

function readUint8(buf, offset) {
  return buf[offset] ?? 0;
}
function readInt8(buf, offset) {
  const v = buf[offset] ?? 0;
  return v > 127 ? v - 256 : v;
}
function readUint16(buf, offset) {
  return (buf[offset] ?? 0) | ((buf[offset + 1] ?? 0) << 8);
}
function readInt16(buf, offset) {
  const v = readUint16(buf, offset);
  return v > 32767 ? v - 65536 : v;
}
function readInt32(buf, offset) {
  const v =
    (buf[offset] ?? 0) |
    ((buf[offset + 1] ?? 0) << 8) |
    ((buf[offset + 2] ?? 0) << 16) |
    ((buf[offset + 3] ?? 0) << 24);
  return v > 2147483647 ? v - 4294967296 : v;
}
function readUint32(buf, offset) {
  return (
    ((buf[offset] ?? 0) |
    ((buf[offset + 1] ?? 0) << 8) |
    ((buf[offset + 2] ?? 0) << 16) |
    ((buf[offset + 3] ?? 0) << 24)) >>> 0
  );
}

function readString(buf, offset, maxLen) {
  let str = '';
  for (let i = 0; i < maxLen; i++) {
    const c = buf[offset + i];
    if (c === 0 || c === undefined) break;
    str += String.fromCharCode(c);
  }
  return str;
}
function readFloat32(buf, offset) {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint8(0, buf[offset] ?? 0);
  view.setUint8(1, buf[offset + 1] ?? 0);
  view.setUint8(2, buf[offset + 2] ?? 0);
  view.setUint8(3, buf[offset + 3] ?? 0);
  return view.getFloat32(0, true);
}

/**
 * Decode common MAVLink messages into a plain object for state.
 * Payload layout is the same for v1 and v2 (wire-order by field size).
 * Returns null if message ID is unknown or payload too short.
 */
export function decodeMavlinkMessage(messageId, payload) {
  if (!payload || !(payload instanceof Uint8Array)) return null;
  const buf = payload;

  const def = MESSAGES_BY_ID[messageId];
  if (def) return decodeDialectMessage(def, buf);

  switch (messageId) {
    case MAV_MSG.HEARTBEAT: {
      if (buf.length < 9) return null;
      return {
        type: 'HEARTBEAT',
        custom_mode: readUint32(buf, 0),
        mav_type: readUint8(buf, 4),
        autopilot: readUint8(buf, 5),
        base_mode: readUint8(buf, 6),
        system_status: readUint8(buf, 7),
        mavlink_version: readUint8(buf, 8),
      };
    }
    case MAV_MSG.SYS_STATUS: {
      if (buf.length < 18) return null;
      return {
        type: 'SYS_STATUS',
        voltage_battery: (readUint16(buf, 12) / 1000).toFixed(2), // mV -> V
        current_battery: readInt16(buf, 14) / 100, // cA -> A
        battery_remaining: readInt8(buf, 16),
      };
    }
    case MAV_MSG.GPS_RAW_INT: {
      if (buf.length < 20) return null;
      return {
        type: 'GPS_RAW_INT',
        fix_type: readUint8(buf, 7),
        lat: readInt32(buf, 8) / 1e7,
        lon: readInt32(buf, 12) / 1e7,
        alt: readFloat32(buf, 16),
        satellites_visible: buf.length >= 29 ? readUint8(buf, 28) : null,
      };
    }
    case MAV_MSG.ATTITUDE: {
      if (buf.length < 28) return null;
      return {
        type: 'ATTITUDE',
        time_boot_ms: readUint32(buf, 0),
        roll: readFloat32(buf, 4),
        pitch: readFloat32(buf, 8),
        yaw: readFloat32(buf, 12),
        rollspeed: readFloat32(buf, 16),
        pitchspeed: readFloat32(buf, 20),
        yawspeed: readFloat32(buf, 24),
      };
    }
    case MAV_MSG.GLOBAL_POSITION_INT: {
      if (buf.length < 28) return null;
      return {
        type: 'GLOBAL_POSITION_INT',
        time_boot_ms: readUint32(buf, 0),
        lat: readInt32(buf, 4) / 1e7,
        lon: readInt32(buf, 8) / 1e7,
        alt: readInt32(buf, 12) / 1000, // mm -> m
        relative_alt: readInt32(buf, 16) / 1000,
        vx: readInt16(buf, 20) / 100, // cm/s -> m/s
        vy: readInt16(buf, 22) / 100,
        vz: readInt16(buf, 24) / 100,
        hdg: readUint16(buf, 26) / 100, // centideg -> deg
      };
    }
    case MAV_MSG.VFR_HUD: {
      if (buf.length < 20) return null;
      return {
        type: 'VFR_HUD',
        airspeed: readFloat32(buf, 0),
        groundspeed: readFloat32(buf, 4),
        alt: readFloat32(buf, 8),
        climb: readFloat32(buf, 12),
        heading: readInt16(buf, 16),
        throttle: readUint16(buf, 18),
      };
    }
    case MAV_MSG.STATUSTEXT: {
      if (buf.length < 2) return null;
      return {
        type: 'STATUSTEXT',
        severity: readUint8(buf, 0),
        text: readString(buf, 1, 50),
      };
    }
    default:
      return { type: 'UNKNOWN', messageId, payloadLength: buf.length };
  }
}

/**
 * Check if Web Serial API is available (Chrome, Edge).
 */
export function isSerialSupported() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/**
 * Request a serial port from the user and open it at the given baud rate.
 * Must be called from a user gesture (e.g. button click).
 * @param {number} baudRate - e.g. 57600 for typical MAVLink telemetry
 * @returns {Promise<SerialPort>} the opened port, or null if user cancelled
 */
export async function requestSerialPort(baudRate = 57600) {
  if (!isSerialSupported()) {
    throw new Error(
      'Web Serial API is not supported in this browser. Use Chrome or Edge.'
    );
  }
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate });
  return port;
}

/**
 * Run a background read loop on an open SerialPort. Parses MAVLink v1 and v2
 * packets and calls onMessage(messageId, payload) for each complete packet.
 * Runs until stopRef.current is set to true or the port is closed.
 *
 * @param {SerialPort} port - opened serial port
 * @param {(messageId: number, payload: Uint8Array) => void} onMessage
 * @param {{ current: boolean }} stopRef - set .current = true to stop the loop
 * @param {(err: Error) => void} onError - optional error callback
 * @param {() => void} onEnd - optional callback when loop exits (e.g. port closed)
 */
export async function runMavlinkReadLoop(
  port,
  onMessage,
  stopRef,
  onError,
  onEnd
) {
  const reader = port.readable.getReader();
  const buffer = [];
  let bytesInBuffer = 0;

  try {
    while (!stopRef.current) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;

      for (let i = 0; i < value.length; i++) {
        buffer.push(value[i]);
        bytesInBuffer++;
      }

      let consumed = 0;
      while (consumed < bytesInBuffer) {
        const start = consumed;
        const stx = buffer[start];

        if (stx === MAVLINK_STX_V2) {
          if (bytesInBuffer - start < V2_HEADER_LEN) break;
          const payloadLen = buffer[start + 1] ?? 0;
          const incompatFlags = buffer[start + 2] ?? 0;
          const signatureLen = (incompatFlags & 0x01) ? 13 : 0;
          const packetLen = V2_HEADER_LEN + payloadLen + 2 + signatureLen;
          if (payloadLen > 255 || start + packetLen > bytesInBuffer) break;

          const messageId =
            (buffer[start + 7] ?? 0) |
            ((buffer[start + 8] ?? 0) << 8) |
            ((buffer[start + 9] ?? 0) << 16);
          const payload = new Uint8Array(payloadLen);
          for (let j = 0; j < payloadLen; j++) {
            payload[j] = buffer[start + V2_HEADER_LEN + j] ?? 0;
          }
          try {
            onMessage(messageId, payload);
          } catch (e) {
            onError?.(e);
          }
          consumed += packetLen;
        } else if (stx === MAVLINK_STX_V1) {
          if (bytesInBuffer - start < V1_HEADER_LEN) break;
          const payloadLen = buffer[start + 1] ?? 0;
          const packetLen = V1_HEADER_LEN + payloadLen + 2;
          if (payloadLen > 255 || start + packetLen > bytesInBuffer) break;

          const messageId = buffer[start + 5] ?? 0;
          const payload = new Uint8Array(payloadLen);
          for (let j = 0; j < payloadLen; j++) {
            payload[j] = buffer[start + V1_HEADER_LEN + j] ?? 0;
          }
          try {
            onMessage(messageId, payload);
          } catch (e) {
            onError?.(e);
          }
          consumed += packetLen;
        } else {
          consumed++;
        }
      }

      if (consumed > 0) {
        buffer.splice(0, consumed);
        bytesInBuffer = buffer.length;
      }
    }
  } catch (err) {
    if (!stopRef.current) onError?.(err);
  } finally {
    reader.releaseLock();
    onEnd?.();
  }
}

// ===========================================================================
// Table-driven encode/decode for the generated dialect (custom messages).
// ===========================================================================

/** CRC-16/MCRF4XX (X25): the checksum MAVLink frames use. */
function crcAccumulate(byte, crc) {
  let tmp = byte ^ (crc & 0xff);
  tmp = (tmp ^ (tmp << 4)) & 0xff;
  return (((crc >> 8) & 0xff) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
}

function readScalar(view, type, offset) {
  switch (type) {
    case 'char':
    case 'uint8_t':
      return view.getUint8(offset);
    case 'int8_t':
      return view.getInt8(offset);
    case 'uint16_t':
      return view.getUint16(offset, true);
    case 'int16_t':
      return view.getInt16(offset, true);
    case 'uint32_t':
      return view.getUint32(offset, true);
    case 'int32_t':
      return view.getInt32(offset, true);
    case 'float':
      return view.getFloat32(offset, true);
    case 'double':
      return view.getFloat64(offset, true);
    case 'uint64_t':
      return view.getBigUint64(offset, true);
    case 'int64_t':
      return view.getBigInt64(offset, true);
    default:
      throw new Error(`Unsupported MAVLink type: ${type}`);
  }
}

function writeScalar(view, type, offset, value) {
  const n = value == null ? 0 : value;
  switch (type) {
    case 'char':
    case 'uint8_t':
      view.setUint8(offset, Number(n) & 0xff);
      break;
    case 'int8_t':
      view.setInt8(offset, Number(n));
      break;
    case 'uint16_t':
      view.setUint16(offset, Number(n) & 0xffff, true);
      break;
    case 'int16_t':
      view.setInt16(offset, Number(n), true);
      break;
    case 'uint32_t':
      view.setUint32(offset, Number(n) >>> 0, true);
      break;
    case 'int32_t':
      view.setInt32(offset, Number(n) | 0, true);
      break;
    case 'float':
      view.setFloat32(offset, Number(n), true);
      break;
    case 'double':
      view.setFloat64(offset, Number(n), true);
      break;
    case 'uint64_t':
      view.setBigUint64(offset, BigInt(n || 0), true);
      break;
    case 'int64_t':
      view.setBigInt64(offset, BigInt(n || 0), true);
      break;
    default:
      throw new Error(`Unsupported MAVLink type: ${type}`);
  }
}

/**
 * Decode a custom-dialect payload into { type, ...fields } using the field
 * table. Handles MAVLink v2 payload truncation by zero-padding to full length.
 */
function decodeDialectMessage(def, payload) {
  const buf = new Uint8Array(def.length);
  buf.set(payload.subarray(0, Math.min(payload.length, def.length)));
  const view = new DataView(buf.buffer);
  const out = { type: def.name };
  const elemSizeOf = t => TYPE_SIZE[t];

  for (const f of def.fields) {
    if (f.arrayLength > 0) {
      if (f.type === 'char') {
        out[f.name] = readString(buf, f.offset, f.arrayLength);
      } else {
        const size = elemSizeOf(f.type);
        const arr = new Array(f.arrayLength);
        for (let i = 0; i < f.arrayLength; i++) {
          arr[i] = readScalar(view, f.type, f.offset + i * size);
        }
        out[f.name] = arr;
      }
    } else {
      out[f.name] = readScalar(view, f.type, f.offset);
    }
  }
  return out;
}

// Per-link outgoing sequence number (wraps at 256).
let txSeq = 0;

/**
 * Build a complete MAVLink v2 frame for a dialect message.
 * @param {string} name - message name, e.g. 'MISSION_CHUNK'
 * @param {Object} values - field name -> value (arrays for array fields).
 *   Missing fields default to 0; arrays shorter than declared are zero-padded.
 * @param {{ systemId?: number, componentId?: number, seq?: number }} [options]
 * @returns {Uint8Array} the framed bytes ready to write to the serial port
 */
export function encodeMavlinkMessage(name, values = {}, options = {}) {
  const def = MESSAGES[name];
  if (!def) throw new Error(`Unknown MAVLink message: ${name}`);

  const systemId = options.systemId ?? DEFAULT_SYSTEM_ID;
  const componentId = options.componentId ?? DEFAULT_COMPONENT_ID;
  const seq = options.seq != null ? options.seq & 0xff : txSeq;
  if (options.seq == null) txSeq = (txSeq + 1) & 0xff;

  const payload = new Uint8Array(def.length);
  const view = new DataView(payload.buffer);
  for (const f of def.fields) {
    const value = values[f.name];
    if (f.arrayLength > 0) {
      const size = TYPE_SIZE[f.type];
      const arr =
        f.type === 'char' && typeof value === 'string'
          ? Array.from(value, c => c.charCodeAt(0))
          : Array.isArray(value)
          ? value
          : value == null
          ? []
          : [value];
      for (let i = 0; i < f.arrayLength; i++) {
        writeScalar(view, f.type, f.offset + i * size, arr[i] ?? 0);
      }
    } else {
      writeScalar(view, f.type, f.offset, value);
    }
  }

  // v2 header: STX, len, incompat, compat, seq, sysid, compid, msgid[3]
  const len = payload.length;
  const frame = new Uint8Array(V2_HEADER_LEN + len + 2);
  frame[0] = MAVLINK_STX_V2;
  frame[1] = len;
  frame[2] = 0; // incompat flags (no signing)
  frame[3] = 0; // compat flags
  frame[4] = seq;
  frame[5] = systemId;
  frame[6] = componentId;
  frame[7] = def.id & 0xff;
  frame[8] = (def.id >> 8) & 0xff;
  frame[9] = (def.id >> 16) & 0xff;
  frame.set(payload, V2_HEADER_LEN);

  let crc = 0xffff;
  for (let i = 1; i < V2_HEADER_LEN + len; i++) crc = crcAccumulate(frame[i], crc);
  crc = crcAccumulate(def.crcExtra, crc);
  frame[V2_HEADER_LEN + len] = crc & 0xff;
  frame[V2_HEADER_LEN + len + 1] = (crc >> 8) & 0xff;

  return frame;
}

/**
 * Write raw framed bytes to an open serial port. Acquires and releases the
 * writer per call so it doesn't conflict with the read loop.
 * @param {SerialPort} port
 * @param {Uint8Array} frame
 */
export async function sendMavlinkFrame(port, frame) {
  if (!port || !port.writable) {
    throw new Error('Serial port is not open for writing');
  }
  const writer = port.writable.getWriter();
  try {
    await writer.write(frame);
  } finally {
    writer.releaseLock();
  }
}
