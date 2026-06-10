/* eslint-disable no-console */
/**
 * MAVLink dialect code generator.
 *
 * Reads a MAVLink dialect XML (single source of truth, shared with the drone
 * firmware) and emits a browser-friendly JS module describing each message:
 * wire-order fields, byte offsets, payload length and CRC_EXTRA. Both the
 * encoder and decoder in src/services/mavlinkSerial.js consume this output.
 *
 * Usage:
 *   yarn generate:mavlink
 *   SKYER_MAVLINK_XML=/path/to/dialect.xml node scripts/generateMavlink.js
 *
 * The generated file is checked in so the app builds without running codegen,
 * but it must be regenerated (and committed) whenever the dialect XML changes.
 */

const fs = require('fs');
const path = require('path');

const CLIENT_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(CLIENT_DIR, '..');

const DEFAULT_XML = path.join(
  REPO_ROOT,
  'onboard_firmware',
  'mavlink',
  'mission_msgs.xml'
);
const XML_PATH = process.env.SKYER_MAVLINK_XML || DEFAULT_XML;
const OUTPUT_PATH = path.join(
  CLIENT_DIR,
  'src',
  'services',
  'mavlinkDialect.generated.js'
);

// Base C type -> byte size. Used for wire-order sorting and offset assignment.
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

// ---------------------------------------------------------------------------
// CRC-16/MCRF4XX (a.k.a. X25), the checksum MAVLink uses for CRC_EXTRA.
// ---------------------------------------------------------------------------
function crcAccumulate(byte, crc) {
  let tmp = byte ^ (crc & 0xff);
  tmp = (tmp ^ (tmp << 4)) & 0xff;
  return (((crc >> 8) & 0xff) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
}

function crcAccumulateStr(str, crc) {
  let c = crc;
  for (let i = 0; i < str.length; i++) {
    c = crcAccumulate(str.charCodeAt(i) & 0xff, c);
  }
  return c;
}

/**
 * Compute the per-message CRC_EXTRA seed. This mirrors pymavlink's
 * message_checksum(): hash the message name and each wire-ordered field's
 * base type, name, and (for arrays) the array length byte.
 */
function computeCrcExtra(name, orderedFields) {
  let crc = 0xffff;
  crc = crcAccumulateStr(`${name} `, crc);
  for (const f of orderedFields) {
    crc = crcAccumulateStr(`${f.type} `, crc);
    crc = crcAccumulateStr(`${f.name} `, crc);
    if (f.arrayLength > 0) crc = crcAccumulate(f.arrayLength, crc);
  }
  return ((crc & 0xff) ^ ((crc >> 8) & 0xff)) & 0xff;
}

// ---------------------------------------------------------------------------
// Minimal XML parsing (the dialect format is small and regular).
// ---------------------------------------------------------------------------
function stripComments(xml) {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

function parseFieldType(rawType) {
  const match = rawType.match(/^([a-zA-Z0-9_]+)(?:\[(\d+)\])?$/);
  if (!match) throw new Error(`Unrecognized field type: "${rawType}"`);
  let base = match[1];
  // MAVLink stores the protocol version field as a plain uint8_t.
  if (base === 'uint8_t_mavlink_version') base = 'uint8_t';
  if (!(base in TYPE_SIZE)) throw new Error(`Unknown base type: "${base}"`);
  return { base, arrayLength: match[2] ? parseInt(match[2], 10) : 0 };
}

function parseEnums(xml) {
  const enums = {};
  const enumRe = /<enum\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/enum>/g;
  let m;
  while ((m = enumRe.exec(xml)) !== null) {
    const enumName = m[1];
    const body = m[2];
    const entries = {};
    const entryRe = /<entry\s+value="([^"]+)"\s+name="([^"]+)"/g;
    let e;
    while ((e = entryRe.exec(body)) !== null) {
      entries[e[2]] = Number(e[1]);
    }
    enums[enumName] = entries;
  }
  return enums;
}

function parseMessages(xml) {
  const messages = [];
  const msgRe = /<message\s+id="(\d+)"\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/message>/g;
  let m;
  while ((m = msgRe.exec(xml)) !== null) {
    const id = parseInt(m[1], 10);
    const name = m[2];
    const body = m[3];

    if (/<extensions\s*\/>/.test(body)) {
      // Extension fields keep XML order and are appended after sorted fields.
      // The current dialect has none; fail loudly if that changes so the
      // generator can be extended deliberately rather than emitting bad offsets.
      throw new Error(
        `Message ${name} uses <extensions>; generator needs extension support.`
      );
    }

    const fields = [];
    const fieldRe = /<field\s+type="([^"]+)"\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/field>/g;
    let f;
    while ((f = fieldRe.exec(body)) !== null) {
      const { base, arrayLength } = parseFieldType(f[1]);
      fields.push({
        name: f[2],
        type: base,
        arrayLength,
        description: f[3].trim(),
      });
    }
    messages.push({ id, name, fields });
  }
  return messages;
}

// ---------------------------------------------------------------------------
// Wire layout: MAVLink sorts fields by base type size (descending, stable),
// then assigns byte offsets in that order.
// ---------------------------------------------------------------------------
function computeWireLayout(fields) {
  const ordered = fields
    .map((field, idx) => ({ field, idx }))
    .sort((a, b) => {
      const sizeDiff = TYPE_SIZE[b.field.type] - TYPE_SIZE[a.field.type];
      return sizeDiff !== 0 ? sizeDiff : a.idx - b.idx;
    })
    .map(({ field }) => field);

  let offset = 0;
  const laidOut = ordered.map(field => {
    const elementSize = TYPE_SIZE[field.type];
    const count = field.arrayLength > 0 ? field.arrayLength : 1;
    const out = { ...field, offset };
    offset += elementSize * count;
    return out;
  });
  return { fields: laidOut, length: offset };
}

// ---------------------------------------------------------------------------
// Optional cross-check against the firmware's generated C headers, so a
// mismatch (wrong CRC algorithm, drifted XML) fails the build instead of
// silently shipping packets the drone will reject.
// ---------------------------------------------------------------------------
function loadCHeaderTruth(mavlinkDir) {
  const buildsDir = path.join(mavlinkDir, 'builds');
  const truth = {};
  const walk = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/^mavlink_msg_.*\.h$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        const nameMatch = text.match(/#define MAVLINK_MSG_ID_([A-Z0-9_]+) \d+\b/);
        if (!nameMatch) continue;
        const name = nameMatch[1];
        const crcMatch = text.match(
          new RegExp(`#define MAVLINK_MSG_ID_${name}_CRC (\\d+)`)
        );
        const lenMatch = text.match(
          new RegExp(`#define MAVLINK_MSG_ID_${name}_LEN (\\d+)`)
        );
        if (crcMatch && lenMatch) {
          truth[name] = {
            crcExtra: parseInt(crcMatch[1], 10),
            length: parseInt(lenMatch[1], 10),
          };
        }
      }
    }
  };
  walk(buildsDir);
  return truth;
}

// ---------------------------------------------------------------------------
function main() {
  if (!fs.existsSync(XML_PATH)) {
    console.error(`[mavlink] Dialect XML not found: ${XML_PATH}`);
    console.error(
      '[mavlink] Initialize the submodule first: git submodule update --init --recursive'
    );
    process.exit(1);
  }

  const rawXml = fs.readFileSync(XML_PATH, 'utf8');
  const xml = stripComments(rawXml);

  const versionMatch = xml.match(/<version>(\d+)<\/version>/);
  const dialectMatch = xml.match(/<dialect>(\d+)<\/dialect>/);
  const version = versionMatch ? parseInt(versionMatch[1], 10) : null;
  const dialect = dialectMatch ? parseInt(dialectMatch[1], 10) : null;

  const enums = parseEnums(xml);
  const parsed = parseMessages(xml);

  const truth = loadCHeaderTruth(path.dirname(XML_PATH));

  const messages = parsed.map(msg => {
    const { fields, length } = computeWireLayout(msg.fields);
    const crcExtra = computeCrcExtra(msg.name, fields);

    const expected = truth[msg.name];
    if (expected) {
      if (expected.crcExtra !== crcExtra) {
        throw new Error(
          `CRC_EXTRA mismatch for ${msg.name}: computed ${crcExtra}, ` +
            `C header says ${expected.crcExtra}. The generator and firmware disagree.`
        );
      }
      if (expected.length !== length) {
        throw new Error(
          `Payload length mismatch for ${msg.name}: computed ${length}, ` +
            `C header says ${expected.length}.`
        );
      }
    }

    return { id: msg.id, name: msg.name, crcExtra, length, fields };
  });

  const fileBody = renderModule({ version, dialect, enums, messages });
  fs.writeFileSync(OUTPUT_PATH, fileBody);

  const rel = path.relative(REPO_ROOT, OUTPUT_PATH);
  console.log(`[mavlink] Wrote ${messages.length} message(s) to ${rel}`);
  for (const m of messages) {
    const checked = truth[m.name] ? ' (verified vs C header)' : '';
    console.log(
      `[mavlink]   ${m.name} id=${m.id} len=${m.length} crc_extra=${m.crcExtra}${checked}`
    );
  }
}

function renderModule({ version, dialect, enums, messages }) {
  const header = `/**
 * AUTO-GENERATED by scripts/generateMavlink.js — DO NOT EDIT BY HAND.
 *
 * Source dialect: Skyer-Onboard mavlink/mission_msgs.xml
 * Regenerate with: yarn generate:mavlink
 *
 * Fields are listed in MAVLink wire order with their byte offset into the
 * payload. crcExtra is the per-message CRC seed required to frame/validate.
 */

/* eslint-disable */
`;

  const meta = `export const DIALECT_INFO = ${JSON.stringify(
    { version, dialect },
    null,
    2
  )};\n`;

  const enumsOut = `export const ENUMS = ${JSON.stringify(enums, null, 2)};\n`;

  const messagesOut = `export const MESSAGES = ${JSON.stringify(
    messages.reduce((acc, m) => {
      acc[m.name] = m;
      return acc;
    }, {}),
    null,
    2
  )};\n`;

  const byIdOut = `export const MESSAGES_BY_ID = {
${messages.map(m => `  ${m.id}: MESSAGES.${m.name},`).join('\n')}
};\n`;

  return [header, meta, enumsOut, messagesOut, byIdOut].join('\n');
}

main();
