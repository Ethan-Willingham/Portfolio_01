import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ROOT, hash, moduleURL, physics, toolLock} from './core.mjs';
import {browserRun, serve} from './browser.mjs';

// This is a construction and visibility check, not a numerical art score.
// Run after rebuilding the public viewer. Both presentations use the same
// current definitions and physical snapshots. The original renderer receives
// identity tags only; its geometry, materials and draw order remain unchanged.
const research = process.env.CHAIN_REACTION_RESEARCH;
assert.ok(research, 'Set CHAIN_REACTION_RESEARCH to the private Chain Reaction directory');
const output = process.env.CHAIN_REACTION_OUTPUT || resolve(research, 'evidence/cycle-26/readability');
const baselineFolder = process.env.CHAIN_REACTION_READABILITY_BASELINE || resolve(research, 'evidence/cycle-26');
const viewports = [{width: 859, height: 767}, {width: 844, height: 390}];
const route = '/chain-reaction.html?paused=1#stage=1';
const rendererPath = '/chain-reaction/connected-renderer.js';
const dressingPath = '/chain-reaction/world-dressing.js';
const manifestPath = '/chain-reaction/stages/viewer/index.json';
const report = {
  purpose: 'Exact physical meshes, real event surface visibility, and reduced nonphysical scaffold',
  assumptions: {
    floor: 'The shared bench represents floor; per-stage floor is not a rendered part group. Its definition and physical snapshot remain unchanged between presentations.',
    surfaceVisibility: 'A visible probe must hit an actual collider of the intended part before any other visible mesh. In-frame projection alone does not pass.',
    contactCells: 'When the solver retains a manifold at the recorded contact tick, each participating contact cell must have a visible surface. CCD can consume a contact without retaining a manifold; those rows explicitly retain body-surface probes and the observer witness.',
    fixtureReduction: 'Stages 1, 3 and 4 require at least 25 percent fewer direct nonphysical fixture meshes. Part groups, constraint links and diorama are excluded. Stage 2 is measured but its new mechanism is not compared as a scaffold acceptance gate.',
    mountFootprint: 'Current nonphysical mounts whose actual world-space box bottom is at the worktop plane must lie within the shared worktop x bounds. Elevated rear-wall brackets are excluded.',
    baseline: 'Original renderer and dressing with current definitions, not a claim that the historical mechanism set is unchanged.',
  },
  sources: [], stages: [], physicsFrames: [], browsers: [], comparisons: [], failures: [],
};
const captured = new Map();
async function capture(pathname) {
  const bytes = await readFile(resolve(ROOT, '.' + pathname));
  captured.set(pathname, bytes);
  report.sources.push({path: pathname, hash: hash(bytes), bytes: bytes.length});
  return bytes;
}
const manifest = JSON.parse(await capture(manifestPath));
const definitions = [];
for (const [index, entry] of manifest.stages.entries()) {
  const path = '/chain-reaction/stages/viewer/' + entry.file;
  const bytes = await capture(path);
  assert.equal(hash(bytes), entry.hash, 'Viewer definition hash does not match manifest: ' + path);
  const definition = JSON.parse(bytes);
  assert.equal(definition.stageNumber, index + 1);
  definitions.push(definition);
  report.stages.push({stage: index + 1, path, hash: hash(bytes), entry: definition.entryId, exit: definition.exitId,
    presentationCamera: definition.presentation?.camera || null});
}
assert.equal(definitions.length, 4, 'This comparison covers the four authored stages');
for (const path of [rendererPath, dressingPath, '/chain-reaction/connected-slice.js',
  '/chain-reaction.css', '/style.css', '/chain-reaction.html', '/js/chain-reaction-physics.js',
  '/js/chain-reaction-events.js', '/js/chain-reaction-materials.js', '/tools/chain-reaction/readability.mjs']) await capture(path);
const originalRenderer = await readFile(resolve(baselineFolder, 'renderer-before.js'), 'utf8');
const originalDressing = await readFile(resolve(baselineFolder, 'dressing-before.js'), 'utf8');
let taggedOriginal = originalRenderer;
for (const [before, after] of [
  ['g.rotation.z=p.angle||0;group.add(g);', 'g.rotation.z=p.angle||0;g.userData.partId=p.id;group.add(g);'],
  ['m.rotation.z=c.angle||0;', 'm.rotation.z=c.angle||0;m.userData={physicalCollider:true,partId:p.id};'],
]) {
  assert.equal(taggedOriginal.split(before).length, 2, 'Original renderer identity fragment changed: ' + before);
  taggedOriginal = taggedOriginal.replace(before, after);
}
report.sources.push(
  {path: resolve(baselineFolder, 'renderer-before.js'), hash: hash(originalRenderer), bytes: Buffer.byteLength(originalRenderer)},
  {path: resolve(baselineFolder, 'dressing-before.js'), hash: hash(originalDressing), bytes: Buffer.byteLength(originalDressing)},
  {path: 'original renderer with identity-only probe', hash: hash(taggedOriginal), bytes: Buffer.byteLength(taggedOriginal)},
);

function transfers(definition) {
  const rows = definition.verified.transfers || definition.verified.steps;
  assert.ok(Array.isArray(rows) && rows.length, 'Missing recorded transfers for stage ' + definition.stageNumber);
  return rows.map(row => {
    const tick = row.tick ?? (row.kind === 'contact' ? row.contactTick : row.motionTick);
    assert.ok(Number.isInteger(tick) && tick > 0, 'Missing actual event tick: ' + row.id);
    assert.ok(definition.parts.some(p => p.id === row.from && !p.fixed), 'Event source is not a mover: ' + row.id);
    assert.ok(definition.parts.some(p => p.id === row.to && !p.fixed), 'Event recipient is not a mover: ' + row.id);
    return {...row, tick};
  });
}

// Keep contact points and participating cell indexes from the actual solver.
// Never replace an unavailable contact point with a body center.
async function physicalFrames(definition) {
  const events = transfers(definition);
  const pending = new Map();
  for (const event of events) {
    for (const [phase, tick] of [['before', Math.max(0, event.tick - 1)], ['event', event.tick],
      ['response', event.motionTick ?? event.tick]]) {
      if (phase === 'response' && tick === event.tick) continue;
      const list = pending.get(tick) || [];
      list.push({event: event.id, kind: event.kind, from: event.from, to: event.to, eventTick: event.tick, phase, tick});
      pending.set(tick, list);
    }
  }
  const simulation = await physics.create(definition, moduleURL);
  const rows = [];
  try {
    const end = Math.max(...pending.keys());
    for (let tick = 0; tick <= end; tick++) {
      if (tick) simulation.step();
      for (const frame of pending.get(tick) || []) {
        const source = simulation.bodies.get(frame.from), recipient = simulation.bodies.get(frame.to);
        const contacts = [];
        if (frame.kind === 'contact' && frame.phase === 'event') {
          for (let a = 0; a < source.numColliders(); a++) for (let b = 0; b < recipient.numColliders(); b++) {
            simulation.world.contactPair(source.collider(a), recipient.collider(b), manifold => {
              for (let i = 0; i < manifold.numSolverContacts(); i++) {
                const point = manifold.solverContactPoint(i);
                if (point) contacts.push({sourceCell: a, recipientCell: b, x: point.x, y: point.y});
              }
            });
          }
        }
        rows.push({...frame, stage: definition.stageNumber, contacts,
          poses: simulation.state().filter(p => p.id === frame.from || p.id === frame.to),
          snapshotHash: hash(simulation.snapshot())});
      }
    }
    return rows;
  } finally {simulation.dispose();}
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function seek(page, stageIndex, tick) {
  await page.evaluate(async ({stageIndex, tick}) => ChainReactionPage.seek(stageIndex + 1, tick / 240), {stageIndex, tick});
  await page.waitForFunction(({stageIndex, tick}) => {
    const state = ChainReactionPage.state();
    return state.paused && state.stage === stageIndex + 1 && state.tick === tick;
  }, {stageIndex, tick});
  await settle(page);
}

// This function is serialized by Playwright and reads the real scene only.
function inspectGeometry({definition, stageIndex, revised}) {
  const T = window.THREE, inspection = ChainReactionPage.inspect(), state = ChainReactionPage.state();
  const map = inspection.partMaps[stageIndex], states = new Map(state.pose.map(p => [p.id, p]));
  const failures = [], cells = [], tolerance = .00001;
  inspection.scene.updateMatrixWorld(true);
  const parts = definition.parts.filter(p => p.id !== 'floor');
  if (map.size !== parts.length) failures.push({type: 'part-count', expected: parts.length, actual: map.size});
  for (const part of parts) {
    const group = map.get(part.id), pose = states.get(part.id);
    if (!group || !pose) {failures.push({type: 'missing-part', part: part.id}); continue;}
    if (revised && (group.userData.partId !== part.id || group.userData.fixed !== !!part.fixed ||
      group.userData.role !== (part.fixed ? 'fixed construction' : 'moving mechanism'))) {
      failures.push({type: 'part-metadata', part: part.id, actual: group.userData});
    }
    const colliders = part.colliders || [{...part, x: 0, y: 0, z: 0, angle: 0}];
    const meshes = group.children.filter(child => child.isMesh && child.userData.physicalCollider);
    if (meshes.length !== colliders.length) failures.push({type: 'collider-count', part: part.id, expected: colliders.length, actual: meshes.length});
    for (const [index, cell] of colliders.entries()) {
      const mesh = meshes[index];
      if (!mesh) continue;
      if (mesh.userData.partId !== part.id) failures.push({type: 'collider-metadata', part: part.id, cell: index, actual: mesh.userData});
      mesh.geometry.computeBoundingBox();
      const actual = mesh.getWorldPosition(new T.Vector3()), actualQuaternion = mesh.getWorldQuaternion(new T.Quaternion());
      const angle = pose.angle + (cell.angle || 0), cosine = Math.cos(pose.angle), sine = Math.sin(pose.angle);
      const expected = {x: stageIndex * 16 + pose.x + (cell.x || 0) * cosine - (cell.y || 0) * sine,
        y: pose.y + (cell.x || 0) * sine + (cell.y || 0) * cosine, z: (part.z || 0) + (cell.z || 0)};
      const width = cell.shape === 'ball' ? 2 * cell.radius : cell.width;
      const height = cell.shape === 'ball' ? 2 * cell.radius : cell.height;
      const depth = cell.shape === 'ball' && part.id.startsWith('marble') ? 2 * cell.radius : cell.depth ?? part.depth ?? .12;
      const bounds = mesh.geometry.boundingBox, expectedQuaternion = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), angle);
      const scale = mesh.getWorldScale(new T.Vector3());
      const errors = {
        center: Math.max(Math.abs(actual.x - expected.x), Math.abs(actual.y - expected.y), Math.abs(actual.z - expected.z)),
        extents: Math.max(Math.abs(bounds.min.x + width / 2), Math.abs(bounds.max.x - width / 2),
          Math.abs(bounds.min.y + height / 2), Math.abs(bounds.max.y - height / 2),
          Math.abs(bounds.min.z + depth / 2), Math.abs(bounds.max.z - depth / 2)),
        orientation: actualQuaternion.angleTo(expectedQuaternion),
        scale: Math.max(Math.abs(scale.x - 1), Math.abs(scale.y - 1), Math.abs(scale.z - 1)),
      };
      const row = {part: part.id, cell: index, shape: cell.shape, fixed: !!part.fixed, actual: {x: actual.x, y: actual.y, z: actual.z},
        expected, expectedExtents: {width, height, depth}, errors, pass: Object.values(errors).every(error => error < tolerance)};
      cells.push(row);
      if (!row.pass) failures.push({type: 'physical-geometry', ...row});
    }
  }
  return {cells, failures, maximumError: Math.max(0, ...cells.flatMap(row => Object.values(row.errors))), pass: !failures.length,
    snapshot: ChainReactionPage.snapshot(), state: {stage: state.stage, tick: state.tick, paused: state.paused}};
}

function inspectScaffold() {
  const {partMaps, links} = ChainReactionPage.inspect();
  return partMaps.map((map, index) => {
    const parent = map.values().next().value.parent;
    const excluded = new Set([...map.values(), ...links.filter(link => link.index === index).map(link => link.group)]);
    const children = parent.children.filter(child => !excluded.has(child));
    let nonPhysicalMeshes = 0, nestedPropMeshes = 0;
    const directFixtureMeshes = children.filter(child => child.isMesh).length;
    for (const child of children) child.traverse(object => {
      if (object.isMesh) {nonPhysicalMeshes++; if (object !== child) nestedPropMeshes++;}
    });
    return {stage: index + 1, directFixtureMeshes, nestedPropMeshes, nonPhysicalMeshes,
      taggedMounts: children.filter(child => child.userData.kind === 'fixed-mount').length,
      partGroups: map.size, linkGroups: links.filter(link => link.index === index).length};
  });
}

function inspectMountFootprints() {
  const T = window.THREE, {scene, bench, mounts, partMaps} = ChainReactionPage.inspect();
  scene.updateMatrixWorld(true);
  const failures = [], batchedWorktops = [], authoredWorktops = [], tolerance = .00001;
  function worldBox(mesh) {
    if (!mesh.isInstancedMesh) return new T.Box3().setFromObject(mesh);
    mesh.geometry.computeBoundingBox();
    const combined = new T.Box3().makeEmpty(), instance = new T.Matrix4(), world = new T.Matrix4();
    for (let index = 0; index < mesh.count; index++) {
      mesh.getMatrixAt(index, instance);
      world.multiplyMatrices(mesh.matrixWorld, instance);
      combined.union(mesh.geometry.boundingBox.clone().applyMatrix4(world));
    }
    return combined;
  }
  bench.traverse(object => {
    if (!object.isMesh) return;
    if (object.userData.batchedScenery && object.userData.worktop) batchedWorktops.push(object);
    else if (object.name.endsWith('-worktop')) authoredWorktops.push(object);
  });
  const worktops = batchedWorktops.length ? batchedWorktops : authoredWorktops;
  const worktopBounds = new T.Box3();
  worktopBounds.makeEmpty();
  for (const mesh of worktops) worktopBounds.union(worldBox(mesh));
  if (!worktops.length || worktopBounds.isEmpty()) failures.push({type: 'missing-worktop-bounds'});
  if (!Array.isArray(mounts) || !mounts.length) failures.push({type: 'missing-mount-metadata'});
  const stageParents = new Map(partMaps.map((map, index) => [map.values().next().value.parent, index + 1]));
  const floorStanding = [], elevated = [];
  for (const [index, mesh] of (mounts || []).entries()) {
    if (!mesh.isMesh || mesh.userData.nonPhysical !== true || mesh.userData.kind !== 'fixed-mount') {
      failures.push({type: 'mount-metadata', index, actual: mesh.userData}); continue;
    }
    const bounds = worldBox(mesh);
    const row = {index, stage: stageParents.get(mesh.parent) || null,
      min: {x: bounds.min.x, y: bounds.min.y, z: bounds.min.z},
      max: {x: bounds.max.x, y: bounds.max.y, z: bounds.max.z}};
    if (Math.abs(bounds.min.y - worktopBounds.max.y) > tolerance) {
      elevated.push(row); continue;
    }
    row.pass = bounds.min.x >= worktopBounds.min.x - tolerance && bounds.max.x <= worktopBounds.max.x + tolerance;
    floorStanding.push(row);
    if (!row.pass) failures.push({type: 'mount-overhang', ...row});
  }
  if (!floorStanding.length) failures.push({type: 'missing-floor-standing-mounts'});
  return {worktopMeshCount: worktops.length, instancedWorktopCount: worktops.filter(mesh => mesh.isInstancedMesh).length, worktopBounds: {
    minX: worktopBounds.min.x, maxX: worktopBounds.max.x, topY: worktopBounds.max.y},
    floorStanding, elevated, failures, pass: !failures.length};
}

function inspectVisibility({definition, stageIndex, frame}) {
  const T = window.THREE, inspection = ChainReactionPage.inspect(), {scene, camera, partMaps} = inspection;
  scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const owners = new Map(), colliderIndex = new Map();
  for (const [index, map] of partMaps.entries()) for (const [id, group] of map.entries()) {
    let cell = 0;
    group.traverse(object => {owners.set(object, {stage: index + 1, part: id});});
    for (const child of group.children) if (child.isMesh && child.userData.physicalCollider) colliderIndex.set(child, cell++);
  }
  const visible = object => {
    for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    return materials.some(material => material && material.visible && material.opacity > 0);
  };
  const meshes = [];
  scene.traverse(object => {if (object.isMesh && visible(object)) meshes.push(object);});
  const ray = new T.Raycaster(), probes = [];
  const participants = [frame.from, frame.to].map((id, participant) => {
    const part = definition.parts.find(p => p.id === id), group = partMaps[stageIndex].get(id);
    const cells = part.colliders || [{...part, x: 0, y: 0, z: 0, angle: 0}];
    const colliderMeshes = group.children.filter(child => child.isMesh && child.userData.physicalCollider);
    const cellResults = cells.map((cell, index) => {
      const mesh = colliderMeshes[index], results = [];
      if (!mesh) return {cell: index, visible: false, probes: [], missing: true};
      mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      for (const xFraction of [-.6, 0, .6]) for (const yFraction of [-.6, 0, .6]) {
        const x = cell.shape === 'ball' ? xFraction * cell.radius : xFraction * cell.width / 2;
        const y = cell.shape === 'ball' ? yFraction * cell.radius : yFraction * cell.height / 2;
        const z = cell.shape === 'ball' && id.startsWith('marble') ? Math.sqrt(Math.max(0, cell.radius ** 2 - x ** 2 - y ** 2)) : bounds.max.z;
        const world = mesh.localToWorld(new T.Vector3(x, y, z)), projected = world.clone().project(camera);
        const inFrame = Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && projected.z >= -1 && projected.z <= 1;
        ray.set(camera.position, world.clone().sub(camera.position).normalize());
        const hits = ray.intersectObjects(meshes, false).filter(hit => {
          const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face?.materialIndex || 0] : hit.object.material;
          return material?.visible && material.opacity > 0;
        });
        const hit = hits[0], owner = hit && owners.get(hit.object);
        const visibleSurface = inFrame && !!hit && owner?.stage === stageIndex + 1 && owner.part === id && hit.object.userData.physicalCollider === true;
        const visibleCell = visibleSurface && colliderIndex.get(hit.object) === index;
        const result = {part: id, cell: index, sample: [xFraction, yFraction], world: {x: world.x, y: world.y, z: world.z},
          screen: {x: (projected.x + 1) / 2, y: (1 - projected.y) / 2}, inFrame, visibleSurface, visibleCell,
          firstHit: hit ? {part: owner?.part || null, stage: owner?.stage || null,
            cell: colliderIndex.get(hit.object) ?? null, physicalCollider: !!hit.object.userData.physicalCollider,
            kind: hit.object.userData.kind || null, name: hit.object.name || null, type: hit.object.type,
            distance: hit.distance, point: {x: hit.point.x, y: hit.point.y, z: hit.point.z}} : null};
        results.push(result); probes.push(result);
      }
      return {cell: index, visible: results.some(result => result.visibleCell), bodyVisible: results.some(result => result.visibleSurface), probes: results};
    });
    const contactCells = [...new Set(frame.contacts.map(contact => participant ? contact.recipientCell : contact.sourceCell))];
    const bodyVisible = cellResults.some(cell => cell.bodyVisible);
    const contactVisible = contactCells.every(index => cellResults[index]?.visible);
    return {part: id, bodyVisible, contactCells, contactVisible, cells: cellResults,
      pass: bodyVisible && contactVisible};
  });
  const state = ChainReactionPage.state(), observation = ChainReactionPage.observations();
  const contactWitness = observation?.events?.events?.find(event => event.id === frame.event) || null;
  return {stage: stageIndex + 1, event: frame.event, phase: frame.phase, kind: frame.kind, tick: state.tick,
    camera: state.camera, contacts: frame.contacts, participants, contactWitness,
    snapshot: ChainReactionPage.snapshot(), pass: participants.every(part => part.pass), probeCount: probes.length};
}

await mkdir(output, {recursive: true});
const unlock = await toolLock();
let server;
try {
  for (const definition of definitions) report.physicsFrames.push(...await physicalFrames(definition));
  server = await serve();
  for (const engine of ['chromium', 'webkit']) await browserRun(engine, async browser => {
    for (const viewport of viewports) for (const variant of ['original', 'current']) {
      const context = await browser.newContext({viewport, deviceScaleFactor: 2});
      const page = await context.newPage(), errors = [], responses = [];
      const row = {engine, viewport, deviceScaleFactor: 2, variant, geometry: [], events: [], errors, scaffold: [], pass: false};
      report.browsers.push(row);
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {if (response.status() >= 400) responses.push({url: response.url(), status: response.status()});});
      await page.route('**/*', request => {
        const pathname = new URL(request.request().url()).pathname;
        let body = captured.get(pathname);
        if (variant === 'original' && pathname === rendererPath) body = taggedOriginal;
        if (variant === 'original' && pathname === dressingPath) body = originalDressing;
        if (!body) return request.continue();
        const contentType = pathname.endsWith('.json') ? 'application/json' : pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.css') ? 'text/css' : 'text/javascript';
        return request.fulfill({contentType, body});
      });
      try {
        await page.goto(server.url + route, {waitUntil: 'networkidle', timeout: 30000});
        await page.waitForFunction(() => window.ChainReactionPage?.ready, null, {timeout: 30000});
        await page.evaluate(() => document.fonts.ready);
        row.quality = await page.evaluate(() => ChainReactionPage.quality());
        row.scaffold = await page.evaluate(inspectScaffold);
        if (variant === 'current') row.mountFootprints = await page.evaluate(inspectMountFootprints);
        for (const [stageIndex, definition] of definitions.entries()) {
          for (const [pose, tick] of [['armed', 0], ['spent', Math.round(definition.verified.duration * 240)]]) {
            await seek(page, stageIndex, tick);
            const geometry = await page.evaluate(inspectGeometry, {definition, stageIndex, revised: variant === 'current'});
            geometry.snapshotHash = hash(Buffer.from(geometry.snapshot)); delete geometry.snapshot;
            row.geometry.push({stage: stageIndex + 1, pose, ...geometry});
            await page.locator('#machine').screenshot({path: resolve(output, `${engine}-${viewport.width}x${viewport.height}-${variant}-stage${stageIndex + 1}-${pose}.png`)});
          }
          for (const frame of report.physicsFrames.filter(frame => frame.stage === stageIndex + 1)) {
            await seek(page, stageIndex, frame.tick);
            const visibility = await page.evaluate(inspectVisibility, {definition, stageIndex, frame});
            visibility.snapshotHash = hash(Buffer.from(visibility.snapshot)); delete visibility.snapshot;
            visibility.physicsSnapshotHash = frame.snapshotHash;
            visibility.physicsSnapshotPass = visibility.snapshotHash === frame.snapshotHash;
            const witness = visibility.contactWitness;
            visibility.contactWitnessPass = frame.kind !== 'contact' || frame.phase === 'before' || witness?.contactTick === frame.eventTick;
            visibility.pass &&= visibility.physicsSnapshotPass && visibility.contactWitnessPass;
            row.events.push(visibility);
            if (frame.phase === 'event' || !visibility.pass) {
              await page.locator('#machine').screenshot({path: resolve(output, `${engine}-${viewport.width}x${viewport.height}-${variant}-stage${stageIndex + 1}-${frame.event}-${frame.phase}.png`)});
            }
          }
        }
        errors.push(...responses.map(response => 'HTTP ' + response.status + ' ' + response.url));
        row.pass = !errors.length && row.geometry.every(sample => sample.pass) && (variant === 'original' || row.events.every(sample => sample.pass) && row.mountFootprints.pass);
      } catch (error) {errors.push(error.stack || String(error));}
      finally {await context.close();}
      console.log(`${engine} ${viewport.width}x${viewport.height} ${variant}: ${row.geometry.length} physical poses, ${row.events.length} event phases, ${row.events.filter(event => !event.pass).length} visibility failures`);
    }
  });
  for (const engine of ['chromium', 'webkit']) for (const viewport of viewports) {
    const original = report.browsers.find(row => row.engine === engine && row.viewport.width === viewport.width && row.variant === 'original');
    const current = report.browsers.find(row => row.engine === engine && row.viewport.width === viewport.width && row.variant === 'current');
    for (const [index, before] of original.scaffold.entries()) {
      const after = current.scaffold[index], removed = before.directFixtureMeshes - (after?.directFixtureMeshes ?? Infinity);
      const fraction = removed / before.directFixtureMeshes, required = [1, 3, 4].includes(before.stage);
      report.comparisons.push({engine, viewport, stage: before.stage, before, after, removed, fraction, required,
        pass: !required || fraction >= .25});
    }
    for (const before of [...original.geometry, ...original.events]) {
      const collection = 'pose' in before ? current.geometry : current.events;
      const after = collection.find(sample => sample.stage === before.stage && sample.pose === before.pose && sample.event === before.event && sample.phase === before.phase);
      if (!after || before.snapshotHash !== after.snapshotHash) report.failures.push({type: 'presentation-changed-physics', engine, viewport, stage: before.stage, pose: before.pose, event: before.event, phase: before.phase,
        original: before.snapshotHash, current: after?.snapshotHash});
    }
  }
  for (const row of report.browsers) {
    for (const error of row.errors) report.failures.push({type: 'browser', engine: row.engine, viewport: row.viewport, variant: row.variant, error});
    for (const sample of row.geometry.filter(sample => !sample.pass)) report.failures.push({type: 'geometry', engine: row.engine, viewport: row.viewport, variant: row.variant, stage: sample.stage, pose: sample.pose, failures: sample.failures});
    if (row.variant === 'current' && row.mountFootprints && !row.mountFootprints.pass) report.failures.push({type: 'mount-footprint', engine: row.engine, viewport: row.viewport, ...row.mountFootprints});
    if (row.variant === 'current') for (const sample of row.events.filter(sample => !sample.pass)) {
      report.failures.push({type: 'event-visibility', engine: row.engine, viewport: row.viewport, stage: sample.stage, event: sample.event, phase: sample.phase, tick: sample.tick,
        physicsSnapshotPass: sample.physicsSnapshotPass, contactWitnessPass: sample.contactWitnessPass,
        parts: sample.participants.filter(part => !part.pass).map(part => ({part: part.part, bodyVisible: part.bodyVisible, contactCells: part.contactCells,
          contactVisible: part.contactVisible, probes: part.cells.flatMap(cell => cell.probes)}))});
    }
  }
  report.failures.push(...report.comparisons.filter(row => !row.pass).map(row => ({type: 'scaffold-reduction', ...row})));
  report.summary = {
    presentations: report.browsers.length,
    armedAndSpentPoses: report.browsers.reduce((total, row) => total + row.geometry.length, 0),
    physicalColliderProbes: report.browsers.reduce((total, row) => total + row.geometry.reduce((total, sample) => total + sample.cells.length, 0), 0),
    maximumGeometryError: Math.max(0, ...report.browsers.flatMap(row => row.geometry.map(sample => sample.maximumError))),
    recordedEventPhases: report.browsers.reduce((total, row) => total + row.events.length, 0),
    surfaceRays: report.browsers.reduce((total, row) => total + row.events.reduce((total, sample) => total + sample.probeCount, 0), 0),
    oldAndNewSnapshotComparisons: report.browsers.length / 2 * (report.physicsFrames.length + definitions.length * 2),
    retainedContactManifolds: report.physicsFrames.filter(frame => frame.contacts.length).length,
    floorStandingMountProbes: report.browsers.reduce((total, row) => total + (row.mountFootprints?.floorStanding.length || 0), 0),
  };
  report.pass = !report.failures.length && report.browsers.length === 8 && report.comparisons.length === 16;
  await writeFile(resolve(output, 'readability.json'), JSON.stringify(report, null, 2) + '\n');
  for (const failure of report.failures) console.error(JSON.stringify(failure.type === 'event-visibility' ? {...failure, parts: failure.parts.map(part => ({...part,
    probes: part.probes.filter(probe => !probe.visibleCell).map(probe => ({cell: probe.cell, sample: probe.sample, inFrame: probe.inFrame, firstHit: probe.firstHit})).slice(0, 6)}))} : failure));
  assert.ok(report.pass, 'Readability check failed; inspect ' + resolve(output, 'readability.json'));
  console.log('Readability PASS: exact collider meshes and visible physical event surfaces; reduced nonphysical scaffold');
} catch (error) {
  if (report.pass === undefined) {
    report.failures.push({type: 'tool', error: error.stack || String(error)});
    report.pass = false;
    await writeFile(resolve(output, 'readability.json'), JSON.stringify(report, null, 2) + '\n');
  }
  throw error;
} finally {if (server) await server.close(); await unlock();}
