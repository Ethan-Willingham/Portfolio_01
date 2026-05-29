#!/usr/bin/env node
/**
 * bake-gltf-points.js
 *
 * Headless GLB-to-point-cloud baker.
 *
 * Usage:
 *   node tools/bake-gltf-points.js <model.glb> [fps] [pointCount] [animationName|index] [outputName]
 *
 * Defaults: fps=24, pointCount=8000, animation=0, outputName=<stem>
 *
 * Output JSON written to stdout:
 * {
 *   "name": str,
 *   "fps": num,
 *   "frameCount": K,
 *   "pointCount": N,
 *   "frames": [ [x0,y0,z0, ...N*3 floats], ...K ]
 * }
 *
 * Strategy:
 *   1. Parse GLB (JSON chunk + binary buffer chunk).
 *   2. Enumerate all skinned meshes. For each mesh/primitive collect:
 *      - POSITION (vec3 per vertex)
 *      - NORMAL (optional)
 *      - JOINTS_0, WEIGHTS_0 (skinning)
 *      - morph target POSITION arrays
 *      - triangle indices
 *   3. Choose N FIXED sample sites via area-weighted triangle sampling
 *      (pick triangles by area, random barycentric per sample). Sites are
 *      expressed as (meshIndex, primIndex, triIndex, u, v) tuples.
 *   4. For each of K time samples:
 *      a. Advance skeletal animation: compute joint world matrices from
 *         per-joint TRS channels (LINEAR T/S, slerp rotation quats).
 *      b. Advance morph weights.
 *      c. For each sample site, evaluate the skinned + morphed position.
 *   5. Normalize: compute bounding box over ALL frame points, center at
 *      origin, uniform scale so max radius ~ 0.4.
 *   6. Round coords to 4 decimals.
 *
 * Dependencies: gl-matrix (npm install gl-matrix)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// gl-matrix (CJS build)
// ---------------------------------------------------------------------------
const glm = require('gl-matrix');
const { vec3, vec4, quat, mat4 } = glm;

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------
function lerp(a, b, t) { return a + (b - a) * t; }

function slerpQuat(out, qa, qb, t) {
  // gl-matrix quat.slerp handles the shortest-path flip
  return quat.slerp(out, qa, qb, t);
}

function assert(cond, msg) {
  if (!cond) { process.stderr.write('ASSERT FAIL: ' + msg + '\n'); process.exit(1); }
}

// ---------------------------------------------------------------------------
// GLB parsing
// ---------------------------------------------------------------------------
function parseGLB(buf) {
  // Header
  const magic   = buf.readUInt32LE(0);
  assert(magic === 0x46546C67, 'Not a GLB file (bad magic)');
  const version = buf.readUInt32LE(4);
  assert(version === 2, 'Only GLB version 2 supported');

  let offset = 12;
  let jsonChunk  = null;
  let binChunk   = null;

  while (offset < buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType   = buf.readUInt32LE(offset + 4);
    const chunkData   = buf.slice(offset + 8, offset + 8 + chunkLength);
    offset += 8 + chunkLength;

    if (chunkType === 0x4E4F534A) {        // JSON
      jsonChunk = JSON.parse(chunkData.toString('utf8'));
    } else if (chunkType === 0x004E4942) { // BIN
      binChunk = chunkData;
    }
  }

  assert(jsonChunk, 'No JSON chunk found in GLB');
  return { gltf: jsonChunk, bin: binChunk };
}

// ---------------------------------------------------------------------------
// Accessor helpers
// ---------------------------------------------------------------------------
const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT     = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function getAccessorData(gltf, bin, buffers, accessorIdx) {
  if (accessorIdx === undefined || accessorIdx === null) return null;
  const acc = gltf.accessors[accessorIdx];
  const bv  = gltf.bufferViews[acc.bufferView];

  const compSize  = COMPONENT_SIZE[acc.componentType];
  const typeCount = TYPE_COUNT[acc.type];
  const stride    = bv.byteStride || (compSize * typeCount);
  const start     = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const srcBuf    = buffers[bv.buffer];

  const result = [];
  for (let i = 0; i < acc.count; i++) {
    const row = [];
    for (let j = 0; j < typeCount; j++) {
      const byteOffset = start + i * stride + j * compSize;
      let val;
      if      (acc.componentType === 5126) val = srcBuf.readFloatLE(byteOffset);
      else if (acc.componentType === 5125) val = srcBuf.readUInt32LE(byteOffset);
      else if (acc.componentType === 5123) val = srcBuf.readUInt16LE(byteOffset);
      else if (acc.componentType === 5121) val = srcBuf.readUInt8(byteOffset);
      else if (acc.componentType === 5122) val = srcBuf.readInt16LE(byteOffset);
      else if (acc.componentType === 5120) val = srcBuf.readInt8(byteOffset);
      else val = 0;
      row.push(val);
    }
    result.push(typeCount === 1 ? row[0] : row);
  }
  return result;
}

function getFloat32Array(gltf, bin, buffers, accessorIdx) {
  const raw = getAccessorData(gltf, bin, buffers, accessorIdx);
  if (!raw) return null;
  const acc       = gltf.accessors[accessorIdx];
  const typeCount = TYPE_COUNT[acc.type];
  if (typeCount === 1) return new Float32Array(raw);
  // Flatten
  const flat = new Float32Array(raw.length * typeCount);
  for (let i = 0; i < raw.length; i++) {
    for (let j = 0; j < typeCount; j++) flat[i * typeCount + j] = raw[i][j];
  }
  return flat;
}

// ---------------------------------------------------------------------------
// Matrix: TRS -> mat4
// ---------------------------------------------------------------------------
function mat4FromTRS(out, T, R, S) {
  // R is [x,y,z,w]
  const q = quat.fromValues(R[0], R[1], R[2], R[3]);
  const t = vec3.fromValues(T[0], T[1], T[2]);
  const s = vec3.fromValues(S[0], S[1], S[2]);
  mat4.fromRotationTranslationScale(out, q, t, s);
  return out;
}

// ---------------------------------------------------------------------------
// Build node hierarchy (local TRS matrices)
// ---------------------------------------------------------------------------
function buildNodeLocalMatrix(node) {
  const m = mat4.create();
  if (node.matrix) {
    // Column-major
    mat4.set(m, ...node.matrix);
    return m;
  }
  const T = node.translation || [0, 0, 0];
  const R = node.rotation    || [0, 0, 0, 1];
  const S = node.scale       || [1, 1, 1];
  mat4FromTRS(m, T, R, S);
  return m;
}

// Compute world matrices for all nodes
function computeWorldMatrices(gltf, nodeLocalOverrides) {
  const N     = gltf.nodes.length;
  const world = Array.from({ length: N }, () => mat4.create());
  const visited = new Uint8Array(N);

  // Build parent map
  const parent = new Int32Array(N).fill(-1);
  for (let ni = 0; ni < N; ni++) {
    const node = gltf.nodes[ni];
    if (node.children) {
      for (const c of node.children) parent[c] = ni;
    }
  }

  function visit(ni) {
    if (visited[ni]) return;
    visited[ni] = 1;
    const local = nodeLocalOverrides ? (nodeLocalOverrides[ni] || buildNodeLocalMatrix(gltf.nodes[ni]))
                                     : buildNodeLocalMatrix(gltf.nodes[ni]);
    if (parent[ni] === -1) {
      mat4.copy(world[ni], local);
    } else {
      visit(parent[ni]);
      mat4.multiply(world[ni], world[parent[ni]], local);
    }
  }

  for (let ni = 0; ni < N; ni++) visit(ni);
  return world;
}

// ---------------------------------------------------------------------------
// Animation sampling
// ---------------------------------------------------------------------------
function findKeyframeIndex(times, t) {
  if (t <= times[0])                    return [0, 0, 0];
  if (t >= times[times.length - 1])    return [times.length - 2, times.length - 1, 1];
  let lo = 0, hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  const alpha = (t - times[lo]) / (times[hi] - times[lo]);
  return [lo, hi, Math.max(0, Math.min(1, alpha))];
}

function sampleChannel(times, values, stride, t, interpolation) {
  const [lo, hi, alpha] = findKeyframeIndex(times, t);
  const a = values.slice(lo * stride, lo * stride + stride);
  const b = values.slice(hi * stride, hi * stride + stride);
  const out = new Float32Array(stride);
  if (interpolation === 'STEP' || alpha === 0) {
    for (let i = 0; i < stride; i++) out[i] = a[i];
  } else if (stride === 4 && interpolation !== 'STEP') {
    // Quaternion slerp
    const qa = quat.fromValues(a[0], a[1], a[2], a[3]);
    const qb = quat.fromValues(b[0], b[1], b[2], b[3]);
    const qo = quat.create();
    quat.slerp(qo, qa, qb, alpha);
    out[0] = qo[0]; out[1] = qo[1]; out[2] = qo[2]; out[3] = qo[3];
  } else {
    for (let i = 0; i < stride; i++) out[i] = lerp(a[i], b[i], alpha);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Collect mesh data
// ---------------------------------------------------------------------------
function collectMeshes(gltf, bin, buffers) {
  // Returns array of { nodeIdx, meshIdx, primitives: [...] }
  // Each primitive: { positions (Float32Array, count*3),
  //                   indices (Uint32Array or null),
  //                   joints (Float32Array, count*4 or null),
  //                   weights (Float32Array, count*4 or null),
  //                   morphPositions: [...Float32Array] (one per morph target),
  //                   skinIdx }
  const meshData = [];

  for (let ni = 0; ni < gltf.nodes.length; ni++) {
    const node = gltf.nodes[ni];
    if (node.mesh === undefined) continue;
    const mesh    = gltf.meshes[node.mesh];
    const skinIdx = node.skin;

    const primData = [];
    for (const prim of mesh.primitives) {
      if (prim.mode !== undefined && prim.mode !== 4) continue; // TRIANGLES only

      const positions = getFloat32Array(gltf, bin, buffers, prim.attributes.POSITION);
      if (!positions) continue;

      // Indices
      let indices = null;
      if (prim.indices !== undefined) {
        const raw = getAccessorData(gltf, bin, buffers, prim.indices);
        indices = new Uint32Array(raw);
      } else {
        const count = positions.length / 3;
        indices = new Uint32Array(count);
        for (let i = 0; i < count; i++) indices[i] = i;
      }

      // Skinning
      const joints  = getFloat32Array(gltf, bin, buffers, prim.attributes.JOINTS_0)  || null;
      const weights = getFloat32Array(gltf, bin, buffers, prim.attributes.WEIGHTS_0) || null;

      // Morph targets
      const morphPositions = [];
      if (prim.targets) {
        for (const target of prim.targets) {
          const mp = getFloat32Array(gltf, bin, buffers, target.POSITION) || null;
          morphPositions.push(mp);
        }
      }

      primData.push({ positions, indices, joints, weights, morphPositions, skinIdx });
    }

    if (primData.length > 0) {
      meshData.push({ nodeIdx: ni, meshIdx: node.mesh, primitives: primData });
    }
  }

  return meshData;
}

// ---------------------------------------------------------------------------
// Inverse bind matrices
// ---------------------------------------------------------------------------
function getSkinData(gltf, bin, buffers) {
  if (!gltf.skins) return [];
  return gltf.skins.map(skin => {
    const joints      = skin.joints;
    const ibmFlat     = getFloat32Array(gltf, bin, buffers, skin.inverseBindMatrices);
    const invBinds    = [];
    for (let j = 0; j < joints.length; j++) {
      const m = mat4.create();
      for (let k = 0; k < 16; k++) m[k] = ibmFlat ? ibmFlat[j * 16 + k] : (k % 5 === 0 ? 1 : 0);
      invBinds.push(m);
    }
    return { joints, invBinds };
  });
}

// ---------------------------------------------------------------------------
// Area-weighted sampling
// ---------------------------------------------------------------------------
function sampleSites(meshData, N) {
  // Compute triangle areas (in rest pose)
  const triPool = []; // { meshIdx, primIdx, primRef, triIdx, a, b, c (vertex indices) }
  let totalArea = 0;

  for (let mi = 0; mi < meshData.length; mi++) {
    const mesh = meshData[mi];
    for (let pi = 0; pi < mesh.primitives.length; pi++) {
      const prim = mesh.primitives[pi];
      const pos  = prim.positions;
      const idx  = prim.indices;
      const triCount = Math.floor(idx.length / 3);
      for (let t = 0; t < triCount; t++) {
        const ai = idx[t * 3], bi = idx[t * 3 + 1], ci = idx[t * 3 + 2];
        const ax = pos[ai*3], ay = pos[ai*3+1], az = pos[ai*3+2];
        const bx = pos[bi*3], by = pos[bi*3+1], bz = pos[bi*3+2];
        const cx = pos[ci*3], cy = pos[ci*3+1], cz = pos[ci*3+2];
        // Cross product of edges
        const ex = bx - ax, ey = by - ay, ez = bz - az;
        const fx = cx - ax, fy = cy - ay, fz = cz - az;
        const area = 0.5 * Math.sqrt(
          (ey*fz - ez*fy)**2 + (ez*fx - ex*fz)**2 + (ex*fy - ey*fx)**2
        );
        if (area > 0) {
          triPool.push({ mi, pi, triIdx: t, ai, bi, ci, area });
          totalArea += area;
        }
      }
    }
  }

  assert(triPool.length > 0, 'No triangles found in mesh data');

  // Build CDF
  const cdf = new Float64Array(triPool.length);
  let cum = 0;
  for (let i = 0; i < triPool.length; i++) {
    cum += triPool[i].area / totalArea;
    cdf[i] = cum;
  }

  // Simple LCG for reproducible sampling
  let seed = 42;
  function rand() {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 4294967296;
  }

  // Binary search in CDF
  function sampleTriIndex() {
    const r = rand();
    let lo = 0, hi = triPool.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  const sites = [];
  for (let s = 0; s < N; s++) {
    const ti   = sampleTriIndex();
    const tri  = triPool[ti];
    // Uniform barycentric via sqrt method
    const r1   = Math.sqrt(rand());
    const r2   = rand();
    const u    = 1 - r1;
    const v    = r1 * (1 - r2);
    const w    = r1 * r2;
    sites.push({ mi: tri.mi, pi: tri.pi, triIdx: tri.triIdx, ai: tri.ai, bi: tri.bi, ci: tri.ci, u, v, w });
  }

  return sites;
}

// ---------------------------------------------------------------------------
// Evaluate one frame
// ---------------------------------------------------------------------------
function evalFrame(sites, meshData, worldMatrices, skinData, morphWeights) {
  const N      = sites.length;
  const result = new Float32Array(N * 3);

  for (let s = 0; s < N; s++) {
    const { mi, pi, ai, bi, ci, u, v, w } = sites[s];
    const prim  = meshData[mi].primitives[pi];
    const pos   = prim.positions;
    const morphP = prim.morphPositions;
    const nmorph = morphP.length;

    // Helper: get vertex position (rest + morph blend)
    function getVertex(vi) {
      let x = pos[vi*3], y = pos[vi*3+1], z = pos[vi*3+2];
      if (nmorph > 0 && morphWeights) {
        const mwm = morphWeights[mi];
        if (mwm) {
          for (let m = 0; m < nmorph; m++) {
            if (!morphP[m]) continue;
            const wt = mwm[m] || 0;
            if (wt === 0) continue;
            x += morphP[m][vi*3]   * wt;
            y += morphP[m][vi*3+1] * wt;
            z += morphP[m][vi*3+2] * wt;
          }
        }
      }
      return [x, y, z];
    }

    // Helper: skin a vertex
    function skinVertex(vi, xyz) {
      const skinIdx = prim.skinIdx;
      if (skinIdx === undefined || skinIdx === null || !prim.joints || !prim.weights) {
        // No skinning: apply node world matrix
        const nm  = worldMatrices[meshData[mi].nodeIdx];
        const out = vec4.fromValues(xyz[0], xyz[1], xyz[2], 1);
        vec4.transformMat4(out, out, nm);
        return [out[0], out[1], out[2]];
      }

      const skin    = skinData[skinIdx];
      const jj      = prim.joints;
      const ww      = prim.weights;
      const j0 = jj[vi*4], j1 = jj[vi*4+1], j2 = jj[vi*4+2], j3 = jj[vi*4+3];
      const w0 = ww[vi*4], w1 = ww[vi*4+1], w2 = ww[vi*4+2], w3 = ww[vi*4+3];

      const vIn = vec4.fromValues(xyz[0], xyz[1], xyz[2], 1);
      const vOut = vec4.fromValues(0, 0, 0, 0);
      const tmp  = vec4.create();
      const jm   = mat4.create();

      const pairs = [[j0, w0], [j1, w1], [j2, w2], [j3, w3]];
      for (const [ji, wi] of pairs) {
        if (wi < 1e-6) continue;
        const jointNodeIdx = skin.joints[ji];
        const jointWorld   = worldMatrices[jointNodeIdx];
        mat4.multiply(jm, jointWorld, skin.invBinds[ji]);
        vec4.transformMat4(tmp, vIn, jm);
        vOut[0] += tmp[0] * wi;
        vOut[1] += tmp[1] * wi;
        vOut[2] += tmp[2] * wi;
      }

      return [vOut[0], vOut[1], vOut[2]];
    }

    const pA = skinVertex(ai, getVertex(ai));
    const pB = skinVertex(bi, getVertex(bi));
    const pC = skinVertex(ci, getVertex(ci));

    result[s*3]   = pA[0]*u + pB[0]*v + pC[0]*w;
    result[s*3+1] = pA[1]*u + pB[1]*v + pC[1]*w;
    result[s*3+2] = pA[2]*u + pB[2]*v + pC[2]*w;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    process.stderr.write('Usage: node tools/bake-gltf-points.js <model.glb> [fps=24] [pointCount=8000] [animName|index=0] [outputName]\n');
    process.exit(1);
  }

  const glbPath    = args[0];
  const fps        = parseFloat(args[1]) || 24;
  const pointCount = parseInt(args[2])   || 8000;
  const animArg    = args[3] !== undefined ? args[3] : '0';
  const outputName = args[4] || path.basename(glbPath, path.extname(glbPath));

  process.stderr.write(`[bake] Reading ${glbPath} ...\n`);
  const buf = fs.readFileSync(glbPath);

  // Parse GLB
  const { gltf, bin } = parseGLB(buf);

  // Build buffer array (GLB only has one buffer; buffer 0 = bin chunk)
  const buffers = (gltf.buffers || []).map((b, i) => {
    if (i === 0) return bin;
    // External buffer (unsupported; return null)
    return null;
  });

  // Find animation
  const anims = gltf.animations || [];
  assert(anims.length > 0, 'No animations found in GLB');

  let animIdx = 0;
  if (/^\d+$/.test(animArg)) {
    animIdx = parseInt(animArg);
  } else {
    animIdx = anims.findIndex(a => a.name && a.name.toLowerCase().includes(animArg.toLowerCase()));
    if (animIdx === -1) {
      process.stderr.write(`[bake] Animation "${animArg}" not found; using 0. Available:\n`);
      anims.forEach((a, i) => process.stderr.write(`  [${i}] ${a.name || '(unnamed)'}\n`));
      animIdx = 0;
    }
  }

  const anim = anims[animIdx];
  process.stderr.write(`[bake] Animation [${animIdx}] "${anim.name || '(unnamed)'}"\n`);

  // Determine duration
  let duration = 0;
  for (const ch of anim.channels) {
    const sampler  = anim.samplers[ch.sampler];
    const times    = getFloat32Array(gltf, bin, buffers, sampler.input);
    const maxT     = times[times.length - 1];
    if (maxT > duration) duration = maxT;
  }
  process.stderr.write(`[bake] Duration: ${duration.toFixed(3)}s, fps: ${fps}\n`);

  const frameCount = Math.max(2, Math.round(duration * fps));
  process.stderr.write(`[bake] frameCount: ${frameCount}\n`);

  // Pre-read all sampler data
  const samplerData = anim.samplers.map(s => ({
    times:  getFloat32Array(gltf, bin, buffers, s.input),
    values: getFloat32Array(gltf, bin, buffers, s.output),
    interp: s.interpolation || 'LINEAR',
    stride: null, // computed below
  }));

  // Collect mesh data
  process.stderr.write(`[bake] Collecting mesh data ...\n`);
  const meshData = collectMeshes(gltf, bin, buffers);
  assert(meshData.length > 0, 'No skinned/unskinned meshes with triangles found');

  const skinData = getSkinData(gltf, bin, buffers);

  // Determine stride for each sampler from output accessor type.
  // For 'weights' channels the accessor type is SCALAR but the actual stride is
  // numMorphTargets (glTF spec: output length = keyframeCount * numMorphTargets).
  // We fix that up below after we know which channel each sampler belongs to.
  for (let i = 0; i < anim.samplers.length; i++) {
    const s   = anim.samplers[i];
    const acc = gltf.accessors[s.output];
    samplerData[i].stride = TYPE_COUNT[acc.type];
  }

  // Identify channels -> nodeIdx -> { T, R, S, morphWeights }
  // nodeChannels: Map<nodeIdx, { T?: samplerIdx, R?: samplerIdx, S?: samplerIdx, W?: samplerIdx }>
  const nodeChannels = new Map();
  for (const ch of anim.channels) {
    const ni   = ch.target.node;
    const path = ch.target.path;
    if (!nodeChannels.has(ni)) nodeChannels.set(ni, {});
    const nc   = nodeChannels.get(ni);
    // Fix stride for morph-weight samplers: stride = numMorphTargets of the node's mesh
    if (path === 'weights' && ni !== undefined) {
      const meshIdx = gltf.nodes[ni] && gltf.nodes[ni].mesh;
      if (meshIdx !== undefined) {
        const mesh = gltf.meshes[meshIdx];
        const prim0 = mesh && mesh.primitives && mesh.primitives[0];
        const numTargets = (prim0 && prim0.targets) ? prim0.targets.length : 0;
        if (numTargets > 0) samplerData[ch.sampler].stride = numTargets;
      }
    }
    if      (path === 'translation') nc.T = ch.sampler;
    else if (path === 'rotation')    nc.R = ch.sampler;
    else if (path === 'scale')       nc.S = ch.sampler;
    else if (path === 'weights')     nc.W = ch.sampler;
  }

  process.stderr.write(`[bake] Sampling ${pointCount} fixed sites ...\n`);
  const sites = sampleSites(meshData, pointCount);

  // Bake frames
  process.stderr.write(`[bake] Baking ${frameCount} frames ...\n`);
  const allFrames = [];

  for (let f = 0; f < frameCount; f++) {
    const t = (f / (frameCount - 1)) * duration;

    // Build per-node local matrices at time t
    const nodeLocalOverrides = {};

    // Per-mesh morph weights (meshIdx -> Float32Array of weights)
    const morphWeights = {};

    for (const [ni, nc] of nodeChannels) {
      const node = gltf.nodes[ni];

      let T, R, S;

      if (nc.T !== undefined) {
        const sd = samplerData[nc.T];
        T = sampleChannel(sd.times, sd.values, 3, t, sd.interp);
      } else {
        T = node.translation ? new Float32Array(node.translation) : new Float32Array([0,0,0]);
      }

      if (nc.R !== undefined) {
        const sd = samplerData[nc.R];
        R = sampleChannel(sd.times, sd.values, 4, t, sd.interp);
      } else {
        R = node.rotation ? new Float32Array(node.rotation) : new Float32Array([0,0,0,1]);
      }

      if (nc.S !== undefined) {
        const sd = samplerData[nc.S];
        S = sampleChannel(sd.times, sd.values, 3, t, sd.interp);
      } else {
        S = node.scale ? new Float32Array(node.scale) : new Float32Array([1,1,1]);
      }

      const m = mat4.create();
      mat4FromTRS(m, T, R, S);
      nodeLocalOverrides[ni] = m;

      // Morph weights
      if (nc.W !== undefined) {
        const sd = samplerData[nc.W];
        // Find which mesh this node belongs to
        if (node.mesh !== undefined) {
          const mi = meshData.findIndex(m => m.nodeIdx === ni);
          if (mi >= 0) {
            morphWeights[mi] = sampleChannel(sd.times, sd.values, sd.stride, t, sd.interp);
          }
        }
      }
    }

    const worldMatrices = computeWorldMatrices(gltf, nodeLocalOverrides);
    const framePositions = evalFrame(sites, meshData, worldMatrices, skinData, morphWeights);
    allFrames.push(framePositions);
  }

  // Normalize: bounding box over ALL frames
  process.stderr.write(`[bake] Normalizing ...\n`);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const fp of allFrames) {
    for (let i = 0; i < fp.length; i += 3) {
      const x = fp[i], y = fp[i+1], z = fp[i+2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const halfDiag = Math.sqrt(
    ((maxX - minX)/2)**2 + ((maxY - minY)/2)**2 + ((maxZ - minZ)/2)**2
  );
  const scale = halfDiag > 0 ? 0.4 / halfDiag : 1;

  // Apply normalize + round
  const finalFrames = allFrames.map(fp => {
    const out = [];
    for (let i = 0; i < fp.length; i += 3) {
      out.push(Math.round((fp[i]   - cx) * scale * 10000) / 10000);
      out.push(Math.round((fp[i+1] - cy) * scale * 10000) / 10000);
      out.push(Math.round((fp[i+2] - cz) * scale * 10000) / 10000);
    }
    return out;
  });

  // Validate
  process.stderr.write(`[bake] Validating ...\n`);

  // 1. No NaN/Inf
  let nanCount = 0;
  for (const fr of finalFrames) {
    for (const v of fr) {
      if (!isFinite(v)) nanCount++;
    }
  }
  process.stderr.write(`[bake] NaN/Inf count: ${nanCount}\n`);
  assert(nanCount === 0, `Found ${nanCount} NaN/Inf values`);

  // 2. Per-frame count == N
  for (let f = 0; f < finalFrames.length; f++) {
    assert(finalFrames[f].length === pointCount * 3,
      `Frame ${f} has ${finalFrames[f].length / 3} points, expected ${pointCount}`);
  }
  process.stderr.write(`[bake] All frames have ${pointCount} points. OK\n`);

  // 3. All points within radius ~0.6
  let maxRadius = 0;
  for (const fr of finalFrames) {
    for (let i = 0; i < fr.length; i += 3) {
      const r = Math.sqrt(fr[i]**2 + fr[i+1]**2 + fr[i+2]**2);
      if (r > maxRadius) maxRadius = r;
    }
  }
  process.stderr.write(`[bake] Max radius: ${maxRadius.toFixed(4)} (should be <= ~0.6)\n`);
  assert(maxRadius <= 0.65, `Max radius ${maxRadius.toFixed(4)} exceeds 0.65`);

  // 4. Points MOVE between frame 0 and frame N/2
  const mid = Math.floor(finalFrames.length / 2);
  let totalDisp = 0;
  const f0 = finalFrames[0];
  const fm = finalFrames[mid];
  for (let i = 0; i < f0.length; i += 3) {
    totalDisp += Math.sqrt(
      (f0[i]-fm[i])**2 + (f0[i+1]-fm[i+1])**2 + (f0[i+2]-fm[i+2])**2
    );
  }
  const meanDisp = totalDisp / pointCount;
  process.stderr.write(`[bake] Mean per-point displacement (frame 0 vs ${mid}): ${meanDisp.toFixed(5)}\n`);
  assert(meanDisp > 0.001, `Mean displacement ${meanDisp.toFixed(5)} is too small — points are not moving`);

  // 5. BBox diagonal roughly stable
  function frameBBoxDiag(fr) {
    let mn = [Infinity,Infinity,Infinity], mx = [-Infinity,-Infinity,-Infinity];
    for (let i = 0; i < fr.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        if (fr[i+j] < mn[j]) mn[j] = fr[i+j];
        if (fr[i+j] > mx[j]) mx[j] = fr[i+j];
      }
    }
    return Math.sqrt((mx[0]-mn[0])**2 + (mx[1]-mn[1])**2 + (mx[2]-mn[2])**2);
  }
  const d0 = frameBBoxDiag(finalFrames[0]);
  const dm = frameBBoxDiag(finalFrames[mid]);
  process.stderr.write(`[bake] BBox diagonal: frame0=${d0.toFixed(4)}, frame${mid}=${dm.toFixed(4)}\n`);
  const ratio = Math.max(d0, dm) / Math.min(d0, dm);
  assert(ratio < 2.5, `BBox diagonal ratio ${ratio.toFixed(3)} too large — incoherent cloud`);

  // Output JSON
  const output = {
    name: outputName,
    fps,
    frameCount,
    pointCount,
    frames: finalFrames,
  };

  process.stderr.write(`[bake] Writing JSON ...\n`);
  process.stdout.write(JSON.stringify(output));
  process.stderr.write(`[bake] Done. ${frameCount} frames x ${pointCount} points.\n`);
}

main();
