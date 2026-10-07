import {jointCoordinate} from './joint-coordinate.mjs';
export const PACING_LIMITS = Object.freeze({ordinarySeconds: 1.5, suspenseSeconds: 3, minimumPathSurfaceSpeed: .25});
export function validatePacing({declaration = null, window = null, intervals}) {
 const failures = [], measured = [];
 let previousEnd = -1;
 for (const r of intervals) {
  if (!Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end < r.start || r.start <= previousEnd) {
   failures.push({type: 'invalid-idle-interval', interval: r}); continue;
  }
  previousEnd = r.end;
  const seconds = (r.end - r.start + 1) / 240;
  if (r.seconds !== seconds) failures.push({type: 'incorrect-idle-duration', interval: r, measuredSeconds: seconds});
  measured.push({...r, seconds});
 }
 const long = measured.filter(r => r.seconds > PACING_LIMITS.ordinarySeconds);
 if (declaration) {
  if (!window || window.start === null || window.end === null) failures.push({type: 'missing-suspense-window'});
  else {
   if (!window.eligible) failures.push({type: 'suspense-before-source'});
   if (window.end < window.start || (window.end - window.start) / 240 > PACING_LIMITS.suspenseSeconds) failures.push({type: 'suspense-window-too-long', window});
   if (long.length > 1) failures.push({type: 'multiple-suspense-intervals', count: long.length});
   for (const r of long) if (r.seconds > PACING_LIMITS.suspenseSeconds || r.start < window.start || r.end > window.end) failures.push({type: 'idle-outside-suspense', interval: r, window});
  }
 } else for (const r of long) failures.push({type: 'ordinary-idle-too-long', interval: r});
 return {pass: failures.length === 0, failures, normalLimit: PACING_LIMITS.ordinarySeconds, suspenseLimit: PACING_LIMITS.suspenseSeconds, minimumPathSurfaceSpeed: PACING_LIMITS.minimumPathSurfaceSpeed, window: window && {...window}, intervals: measured, longestIdle: Math.max(0, ...measured.map(r => r.seconds))};
}
function validateDeclaration(definition, constraints, declaration) {
 if (declaration === null) return null;
 if (!declaration || Array.isArray(declaration) || typeof declaration.id !== 'string' || !declaration.id || declaration.maximumSeconds !== PACING_LIMITS.suspenseSeconds) throw Error('Invalid single suspense declaration');
 const start = declaration.start;
 if (start?.kind !== 'prismatic-coordinate' || !Number.isFinite(start.atLeast) || !(start.atLeast > 0)) throw Error('Invalid suspense start');
 const joints = definition.joints.filter(j => j.type === 'prismatic' && j.a === start.a && j.b === start.b);
 if (joints.length !== 1 || !definition.parts.find(p => p.id === start.a)?.fixed || !joints[0].limits || start.atLeast < joints[0].limits[0] || start.atLeast > joints[0].limits[1] || !(Math.hypot(joints[0].axis.x, joints[0].axis.y) > 0)) throw Error('Suspense start needs a fixed guide and reachable stroke');
 if (declaration.end?.marker !== 'motionTick' || !definition.steps.some(s => s.id === declaration.end.event)) throw Error('Suspense end must be a declared physical motion');
 if (!Array.isArray(declaration.requires) || !declaration.requires.length) throw Error('Suspense needs an upstream cause');
 const links = constraints?.report(false).rows ?? [];
 for (const r of declaration.requires) {
  if (Object.keys(r).length !== 1) throw Error('Ambiguous suspense cause');
  if (r.event) {if (!definition.steps.some(s => s.id === r.event)) throw Error('Unknown suspense source contact');}
  else if (r.constraint) {if (!links.some(l => l.id === r.constraint)) throw Error('Unknown suspense source constraint');}
  else throw Error('Invalid suspense cause');
 }
 return joints[0];
}
export function watchPacing(sim, definition, contacts, constraints = null, declaration = null) {
 declaration = declaration && structuredClone(declaration);
 const joint = validateDeclaration(definition, constraints, declaration);
 const window = declaration ? {id: declaration.id, start: null, end: null, eligible: false} : null;
 const path = definition.parts.filter(p => !p.fixed && definition.path.includes(p.id)).map(p => {
  let radius = 0;
  for (const c of p.colliders || [{...p, x: 0, y: 0, angle: 0}]) radius = Math.max(radius, Math.sqrt((c.x || 0) ** 2 + (c.y || 0) ** 2) + (c.shape === 'ball' ? c.radius : Math.sqrt(c.width * c.width + c.height * c.height) / 2));
  return {id: p.id, radius};
 });
 const closed = []; let idleStart = null;
 return {
  sample() {
   if (declaration) {
    const contactReport = contacts.report(false), events = contactReport.events, links = constraints?.report(false);
    if (window.start === null && jointCoordinate(sim, joint) >= declaration.start.atLeast) {
     window.start = sim.tick;
     window.eligible = contactReport.pass && (!links || links.pass) && declaration.requires.every(r => r.event ? events.some(e => e.id === r.event && e.contactTick !== null && e.contactTick <= sim.tick) : links.rows.some(l => l.id === r.constraint && l.eligibleTick !== null && l.eligibleTick <= sim.tick));
    }
    const end = events.find(e => e.id === declaration.end.event)?.motionTick;
    if (window.end === null && end !== null && end !== undefined) window.end = end;
   }
   let active = 0;
   for (const p of path) {const b = sim.bodies.get(p.id), v = b.linvel(); active = Math.max(active, Math.sqrt(v.x * v.x + v.y * v.y) + Math.abs(b.angvel()) * p.radius);}
   if (active < PACING_LIMITS.minimumPathSurfaceSpeed) {if (idleStart === null) idleStart = sim.tick;}
   else if (idleStart !== null) {closed.push({start: idleStart, end: sim.tick - 1, seconds: (sim.tick - idleStart) / 240}); idleStart = null;}
  },
  report() {
   const intervals = [...closed, ...(idleStart === null ? [] : [{start: idleStart, end: sim.tick, seconds: (sim.tick - idleStart + 1) / 240}])];
   return validatePacing({declaration, window, intervals});
  }
 };
}
