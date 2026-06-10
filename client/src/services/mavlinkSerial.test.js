import {
  encodeMavlinkMessage,
  decodeMavlinkMessage,
} from './mavlinkSerial';
import { MESSAGES } from './mavlinkDialect.generated';

const MAVLINK_STX_V2 = 0xfd;
const V2_HEADER_LEN = 10;

// Independent re-implementation of MAVLink's CRC so the test validates the
// encoder rather than mirroring its private helper.
function crc16Mcrf4xx(bytes, extra) {
  let crc = 0xffff;
  const acc = b => {
    let tmp = b ^ (crc & 0xff);
    tmp = (tmp ^ (tmp << 4)) & 0xff;
    crc = (((crc >> 8) & 0xff) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
  };
  bytes.forEach(acc);
  acc(extra);
  return crc;
}

describe('mavlink dialect codegen', () => {
  it('matches the firmware CRC_EXTRA and length values', () => {
    expect(MESSAGES.MISSION_CHUNK.crcExtra).toBe(40);
    expect(MESSAGES.MISSION_CHUNK.length).toBe(243);
    expect(MESSAGES.MISSION_CHUNK_ACK.crcExtra).toBe(211);
    expect(MESSAGES.MISSION_CHUNK_ACK.length).toBe(7);
  });
});

describe('encodeMavlinkMessage', () => {
  it('frames MISSION_CHUNK_ACK with a valid v2 header, payload and CRC', () => {
    const frame = encodeMavlinkMessage(
      'MISSION_CHUNK_ACK',
      { mission_id: 0x01020304, chunk_id: 5, result: 1, chunks_received: 3 },
      { systemId: 255, componentId: 190, seq: 7 }
    );

    expect(frame.length).toBe(V2_HEADER_LEN + 7 + 2);
    expect(frame[0]).toBe(MAVLINK_STX_V2);
    expect(frame[1]).toBe(7); // payload length
    expect(frame[4]).toBe(7); // seq
    expect(frame[5]).toBe(255); // sysid
    expect(frame[6]).toBe(190); // compid
    expect(frame[7]).toBe(201); // msgid low byte
    expect(frame[8]).toBe(0);
    expect(frame[9]).toBe(0);

    // Payload at correct wire offsets (little-endian uint32 then 3x uint8).
    const payload = frame.subarray(V2_HEADER_LEN, V2_HEADER_LEN + 7);
    expect(Array.from(payload)).toEqual([0x04, 0x03, 0x02, 0x01, 5, 1, 3]);

    // CRC over [len..end of payload] + crc_extra, little-endian trailer.
    const crcRegion = frame.subarray(1, V2_HEADER_LEN + 7);
    const crc = crc16Mcrf4xx(crcRegion, MESSAGES.MISSION_CHUNK_ACK.crcExtra);
    expect(frame[V2_HEADER_LEN + 7]).toBe(crc & 0xff);
    expect(frame[V2_HEADER_LEN + 7 + 1]).toBe((crc >> 8) & 0xff);
  });

  it('round-trips MISSION_CHUNK array fields through encode + decode', () => {
    const lat = Array.from({ length: 18 }, (_, i) => i * 1.5);
    const lon = Array.from({ length: 18 }, (_, i) => -i * 0.25);
    const camera_action = Array.from({ length: 18 }, (_, i) => i % 5);

    const frame = encodeMavlinkMessage('MISSION_CHUNK', {
      mission_id: 42,
      total_waypoints: 18,
      total_chunks: 2,
      chunk_id: 1,
      num_in_chunk: 9,
      lat,
      lon,
      camera_action,
    });

    const payload = frame.subarray(V2_HEADER_LEN, V2_HEADER_LEN + 243);
    const decoded = decodeMavlinkMessage(200, payload);

    expect(decoded.type).toBe('MISSION_CHUNK');
    expect(decoded.mission_id).toBe(42);
    expect(decoded.total_waypoints).toBe(18);
    expect(decoded.chunk_id).toBe(1);
    expect(decoded.num_in_chunk).toBe(9);
    decoded.lat.forEach((v, i) => expect(v).toBeCloseTo(lat[i], 4));
    decoded.lon.forEach((v, i) => expect(v).toBeCloseTo(lon[i], 4));
    expect(decoded.camera_action).toEqual(camera_action);
    // alt was omitted -> zero-filled
    expect(decoded.alt).toEqual(new Array(18).fill(0));
  });

  it('throws for an unknown message name', () => {
    expect(() => encodeMavlinkMessage('NOPE', {})).toThrow(/Unknown MAVLink/);
  });
});
