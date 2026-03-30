#!/usr/bin/env node
/**
 * Generates a 3D drone GLB by extruding the 2D SVG quadcopter icon.
 * Output: client/public/models/drone.glb
 *
 * The SVG top (y=small) maps to -Z in glTF, which Cesium treats as
 * North at heading=0.
 */
const fs = require('fs');
const path = require('path');

const S = 0.009; // meters per SVG pixel — 64px icon ≈ 0.58m span
const THICKNESS = 0.045;
const ROTOR_THICKNESS = 0.035;
const INDICATOR_THICKNESS = 0.055;

// Match the 2D SVG icon colors exactly
const ARM_WHITE  = [1.0, 1.0, 1.0, 1];       // #fff arms
const BODY_DARK  = [0.13, 0.13, 0.13, 1];     // #222 center body
const ROTOR_BLUE = [0.27, 0.67, 1.0, 1];      // #4af rotor rings
const ROTOR_DARK = [0.0, 0.0, 0.0, 0.5];      // rgba(0,0,0,0.4) rotor fill
const INDICATOR  = [1.0, 0.27, 0.27, 1];       // #f44 front arrow

// Map SVG (64x64, center 32,32) to model XZ. SVG top → -Z (forward).
function sv(x, y) {
  return [(x - 32) * S, (y - 32) * S];
}

function circle(cx, cz, r, n = 16) {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
  });
}

function lineRect(x1, z1, x2, z2, w) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz) || 1;
  const px = (-dz / len) * (w / 2), pz = (dx / len) * (w / 2);
  return [[x1 + px, z1 + pz], [x2 + px, z2 + pz], [x2 - px, z2 - pz], [x1 - px, z1 - pz]];
}

// Extrude a convex 2D polygon into a 3D slab centered at y=0
function extrude(pts, h, color) {
  const hy = h / 2;
  const N = pts.length;
  const pos = [], norm = [], col = [], idx = [];
  let vi = 0;

  // Top face
  for (const [x, z] of pts) { pos.push(x, hy, z); norm.push(0, 1, 0); col.push(...color); }
  for (let i = 1; i < N - 1; i++) idx.push(vi, vi + i, vi + i + 1);
  vi += N;

  // Bottom face (reversed winding)
  for (const [x, z] of pts) { pos.push(x, -hy, z); norm.push(0, -1, 0); col.push(...color); }
  for (let i = 1; i < N - 1; i++) idx.push(vi, vi + i + 1, vi + i);
  vi += N;

  // Side faces
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const [x0, z0] = pts[i], [x1, z1] = pts[j];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len, nz = -dx / len;
    pos.push(x0, hy, z0, x1, hy, z1, x1, -hy, z1, x0, -hy, z0);
    for (let k = 0; k < 4; k++) { norm.push(nx, 0, nz); col.push(...color); }
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  }

  return { pos, norm, col, idx };
}

function merge(parts) {
  const pos = [], norm = [], col = [], idx = [];
  let off = 0;
  for (const p of parts) {
    pos.push(...p.pos); norm.push(...p.norm); col.push(...p.col);
    for (const i of p.idx) idx.push(i + off);
    off += p.pos.length / 3;
  }
  return { pos, norm, col, idx };
}

// --- Define shapes from the SVG ---

// Rotor centers (SVG coords)
const rotorSVG = [[12, 12], [52, 12], [12, 52], [52, 52]];
const rotorXZ = rotorSVG.map(([x, y]) => sv(x, y));

// Body: dark circle (SVG: cx=32, cy=32, r=6, fill=#222)
// with white stroke ring (stroke-width=2) → outer ring at r=7
const bodyInner = circle(0, 0, 6 * S, 16);
const bodyRing = circle(0, 0, 8 * S, 16);

// Rotor circles: dark fill (r=9) with blue stroke ring (stroke-width=2) → blue ring r=9..11
const rotorFills = rotorXZ.map(([cx, cz]) => circle(cx, cz, 9 * S, 16));
const rotorRings = rotorXZ.map(([cx, cz]) => circle(cx, cz, 11 * S, 16));

// Arms: white lines from center to each rotor (SVG stroke-width=3)
const arms = rotorXZ.map(([rx, rz]) => lineRect(0, 0, rx, rz, 3.5 * S));

// Front indicator triangle (SVG: polygon 32,26 35,34 32,32 29,34 fill=#f44)
const indicator = [sv(32, 26), sv(35, 34), sv(32, 32), sv(29, 34)];

// --- Extrude everything ---
const mesh = merge([
  // Arms first (white, behind everything)
  ...arms.map(a => extrude(a, THICKNESS * 0.8, ARM_WHITE)),
  // Blue rotor rings (slightly below rotor fill)
  ...rotorRings.map(r => extrude(r, ROTOR_THICKNESS * 0.9, ROTOR_BLUE)),
  // Dark rotor fills on top
  ...rotorFills.map(r => extrude(r, ROTOR_THICKNESS, ROTOR_DARK)),
  // White body ring
  extrude(bodyRing, THICKNESS, ARM_WHITE),
  // Dark body center
  extrude(bodyInner, THICKNESS * 1.1, BODY_DARK),
  // Red front indicator
  extrude(indicator, INDICATOR_THICKNESS, INDICATOR),
]);

// --- Pack binary ---
const vc = mesh.pos.length / 3;
const ic = mesh.idx.length;

const posB  = Buffer.alloc(vc * 12);
const normB = Buffer.alloc(vc * 12);
const colB  = Buffer.alloc(vc * 16);
const idxB  = Buffer.alloc(ic * 2);

mesh.pos.forEach((v, i) => posB.writeFloatLE(v, i * 4));
mesh.norm.forEach((v, i) => normB.writeFloatLE(v, i * 4));
mesh.col.forEach((v, i) => colB.writeFloatLE(v, i * 4));
mesh.idx.forEach((v, i) => idxB.writeUInt16LE(v, i * 2));

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < mesh.pos.length; i += 3)
  for (let j = 0; j < 3; j++) {
    min[j] = Math.min(min[j], mesh.pos[i + j]);
    max[j] = Math.max(max[j], mesh.pos[i + j]);
  }

const idxPad = (4 - (idxB.length % 4)) % 4;
const bin = Buffer.concat([posB, normB, colB, idxB, Buffer.alloc(idxPad)]);

// --- glTF JSON ---
const gltf = {
  asset: { version: '2.0', generator: 'swallow-drone-gen' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0 }] }],
  extensionsUsed: ['KHR_materials_unlit'],
  materials: [{
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 },
    extensions: { KHR_materials_unlit: {} },
    doubleSided: true,
  }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: vc, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: vc, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: vc, type: 'VEC4' },
    { bufferView: 3, componentType: 5123, count: ic, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posB.length },
    { buffer: 0, byteOffset: posB.length, byteLength: normB.length },
    { buffer: 0, byteOffset: posB.length + normB.length, byteLength: colB.length },
    { buffer: 0, byteOffset: posB.length + normB.length + colB.length, byteLength: idxB.length },
  ],
  buffers: [{ byteLength: bin.length }],
};

// --- Encode GLB ---
const jsonBuf = Buffer.from(JSON.stringify(gltf));
const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
const jsonPadded = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

const totalLen = 12 + 8 + jsonPadded.length + 8 + bin.length;
const glb = Buffer.alloc(totalLen);
let o = 0;
glb.writeUInt32LE(0x46546C67, o); o += 4;
glb.writeUInt32LE(2, o); o += 4;
glb.writeUInt32LE(totalLen, o); o += 4;
glb.writeUInt32LE(jsonPadded.length, o); o += 4;
glb.writeUInt32LE(0x4E4F534A, o); o += 4;
jsonPadded.copy(glb, o); o += jsonPadded.length;
glb.writeUInt32LE(bin.length, o); o += 4;
glb.writeUInt32LE(0x004E4942, o); o += 4;
bin.copy(glb, o);

const outDir = path.join(__dirname, '..', 'client', 'public', 'models');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'drone.glb');
fs.writeFileSync(outPath, glb);
console.log(`drone.glb: ${glb.length} bytes, ${vc} vertices, ${ic / 3} triangles`);
