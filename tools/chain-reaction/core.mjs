import { readFile, readdir, open, unlink } from 'node:fs/promises';
import { unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
await import(pathToFileURL(resolve(ROOT, 'js/chain-reaction-physics.js')));
export const physics = globalThis.ChainReaction.physics;
export const moduleURL = pathToFileURL(resolve(ROOT, 'js/vendor/rapier2d-0.21.0/rapier.mjs')).href;
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function fixtures() {
  const directory = resolve(ROOT, 'tools/chain-reaction/fixtures');
  return Promise.all((await readdir(directory)).filter(x => x.endsWith('.json') && x !== 'hashes.json').sort().map(async name => JSON.parse(await readFile(resolve(directory, name), 'utf8'))));
}
export function deadline(ms) {
  const timer = setTimeout(() => { process.stderr.write('Hard timeout\n'); process.exit(124); }, ms);
  return () => clearTimeout(timer);
}
export async function run(definition, collect = false) {
  const sim = await physics.create(definition, moduleURL), history = [];
  try {
    for (let i = 0; i < definition.ticks; i++) { sim.step(); if (collect) history.push(sim.state()); }
    return { name: definition.name, ticks: sim.tick, hash: hash(sim.snapshot()), state: sim.state(), history };
  } finally { sim.dispose(); }
}
export function validate(definition, result) {
  const get = (id, state = result.state) => state.find(p => p.id === id);
  const samples = result.history.length ? result.history : [result.state];
  const failures = [];
  for (const check of definition.checks) {
    const value = get(check.id);
    let ok;
    if (check.type === 'range') ok = value[check.key] >= check.min && value[check.key] <= check.max;
    else if (check.type === 'sleep') ok = value.sleeping;
    else if (check.type === 'fallen') ok = Math.abs(value.angle) >= check.min;
    else if (check.type === 'finite') ok = samples.every(s => s.every(p => [p.x,p.y,p.angle,p.vx,p.vy,p.spin].every(Number.isFinite)));
    else if (check.type === 'minX') ok = samples.every(s => get(check.id,s).x >= check.min);
    else if (check.type === 'maxX') ok = samples.every(s => get(check.id,s).x <= check.max);
    else if (check.type === 'motion') {
      const positions = samples.map(s => get(check.id,s));
      ok = Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x))
        + Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y))
        + Math.max(...positions.map(p => p.angle)) - Math.min(...positions.map(p => p.angle)) >= check.min;
    } else if (check.type === 'ropeStretch' || check.type === 'jointError') {
      const j = definition.joints[check.index];
      // Joint anchors are read from the actual solver, in the isolation test below.
      ok = check.type === 'ropeStretch' ? result.maxRopeRatio[check.index] <= check.max : result.maxJointError[check.index] <= check.max;
    } else throw Error('Unknown check ' + check.type);
    if (!ok) failures.push(check);
  }
  return failures;
}
export async function isolation(definition) {
  const sim = await physics.create(definition,moduleURL), history=[], maxJointError=[],maxRopeRatio=[];
  try {
    const joints=[]; sim.world.impulseJoints.forEach(j => joints.push(j));
    for (let i=0;i<definition.ticks;i++) {
      sim.step();history.push(sim.state());
      for (let k=0;k<joints.length;k++) {
        const j=joints[k], a=j.body1(), b=j.body2();
        const transform=(body,anchor)=> {const p=body.translation(), angle=body.rotation();return {x:p.x+anchor.x*Math.cos(angle)-anchor.y*Math.sin(angle),y:p.y+anchor.x*Math.sin(angle)+anchor.y*Math.cos(angle)};};
        const p=transform(a,j.anchor1()),q=transform(b,j.anchor2()), distance=Math.sqrt((p.x-q.x)**2+(p.y-q.y)**2);
        maxJointError[k]=Math.max(maxJointError[k]||0,distance);
        if(definition.joints[k].type==='rope') maxRopeRatio[k]=Math.max(maxRopeRatio[k]||0,distance/definition.joints[k].length);
      }
    }
    return {name:definition.name,ticks:sim.tick,hash:hash(sim.snapshot()),state:sim.state(),history,maxJointError,maxRopeRatio};
  } finally {sim.dispose();}
}

export async function toolLock() {
  const path='/tmp/chain-reaction-tools.lock';
  let handle;
  try {handle=await open(path,'wx');}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const pid=Number(await readFile(path,'utf8'));
    if(!Number.isInteger(pid)||pid<1)throw Error('Unrecognized tool lock, inspect '+path);
    try {process.kill(pid,0);throw Error('Another Chain Reaction tool is running: PID '+pid);}
    catch(error){if(error.code!=='ESRCH')throw error;}
    await unlink(path);handle=await open(path,'wx');
  }
  await handle.writeFile(String(process.pid));
  const onExit=()=>{try{unlinkSync(path);}catch{}};
  process.once('exit',onExit);
  return async()=>{process.removeListener('exit',onExit);await handle.close();await unlink(path);};
}
