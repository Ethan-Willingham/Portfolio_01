// Read-only rope handoffs. Contact observations and constraint observations stay distinct.
const MOTION_AXES = new Set(['x', 'y', 'angle']);
function validateMotion(motion) {
 if (!motion || !MOTION_AXES.has(motion.axis) || ![1, -1].includes(motion.sign) || !(motion.travel > 0) || !Number.isFinite(motion.travel)) throw Error('Invalid constraint motion');
}
function touching(sim, a, b) {
 const source = sim.bodies.get(a), recipient = sim.bodies.get(b);
 for (let i = 0; i < source.numColliders(); i++) for (let j = 0; j < recipient.numColliders(); j++) {
  const A = source.collider(i), B = recipient.collider(j), ga = A.collisionGroups(), gb = B.collisionGroups();
  if (((ga >>> 16) & gb & 65535) && ((gb >>> 16) & ga & 65535) && A.contactCollider(B, 0)) return true;
 }
 return false;
}
function endpoint(sim, id, anchor) {
 const body = sim.bodies.get(id), p = body.translation(), angle = body.rotation(), c = Math.cos(angle), s = Math.sin(angle);
 const x = p.x + c * anchor.x - s * anchor.y, y = p.y + s * anchor.x + c * anchor.y, v = body.linvel(), center = body.worldCom();
 return {x, y, vx: v.x - body.angvel() * (y - center.y), vy: v.y + body.angvel() * (x - center.x)};
}
export function watchConstraints(sim, definition, contactObserver, declarations) {
 if (!Array.isArray(declarations)) throw Error('Constraint declarations must be an array');
 const starts = new Map(definition.parts.map(p => [p.id, p])), ids = new Set(), failures = [];
 const rows = declarations.map(declaration => {
  const r = structuredClone(declaration);
  if (typeof r.id !== 'string' || !r.id || ids.has(r.id)) throw Error('Duplicate or invalid constraint ID');
  if (r.kind !== 'rope' || r.from === r.to || !starts.has(r.from) || !starts.has(r.to)) throw Error('Invalid constraint bodies');
  validateMotion(r.sourceMotion); validateMotion(r.motion);
  if (!Array.isArray(r.requires) || !r.requires.length) throw Error('Constraint needs an upstream cause');
  if (!r.requires.some(c => c?.event || c?.constraint)) throw Error('Support clearance alone is not an upstream trigger');
  for (const condition of r.requires) {
   if (!condition || ['event', 'constraint', 'clearPair'].filter(key => key in condition).length !== 1) throw Error('Invalid upstream cause');
   if (condition.event) {
    if (!['contactTick', 'motionTick'].includes(condition.marker)) throw Error('Invalid upstream event marker');
    if (!definition.steps.some(step => step.id === condition.event)) throw Error('Unknown upstream event');
   } else if (condition.constraint) {
    if (!ids.has(condition.constraint)) throw Error('Constraint cause must precede its recipient');
   } else if (condition.clearPair) {
    if (!Array.isArray(condition.clearPair) || condition.clearPair.length !== 2 || condition.clearPair[0] === condition.clearPair[1] || condition.clearPair.some(id => !starts.has(id))) throw Error('Invalid support pair');
   } else throw Error('Unknown upstream cause');
  }
  ids.add(r.id);
  const joints = definition.joints.filter(j => j.type === 'rope' && [j.a, j.b].includes(r.from) && [j.a, j.b].includes(r.to));
  if (joints.length > 1) throw Error('Ambiguous rope handoff');
  const joint = joints[0];
  if (joint && (!(joint.length > 0) || !Number.isFinite(joint.length) || ['anchorA', 'anchorB'].some(k => !Number.isFinite(joint[k]?.x) || !Number.isFinite(joint[k]?.y)))) throw Error('Invalid rope geometry');
  if (!joint) failures.push({type: 'missing-constraint', id: r.id});
  return {...r, joint, sourceMotionTick: null, eligibleTick: null, motionTick: null};
 });
 const travel = (id, motion) => {
  const b = sim.bodies.get(id), p = starts.get(id);
  return ((motion.axis === 'angle' ? b.rotation() : b.translation()[motion.axis]) - (p[motion.axis] || 0)) * motion.sign;
 };
 return {
  sample() {
   const contactReport = contactObserver.report(false), events = contactReport.events;
   for (const r of rows) {
    const sourceTravel = travel(r.from, r.sourceMotion), recipientTravel = travel(r.to, r.motion);
    if (r.sourceMotionTick === null && sourceTravel > r.sourceMotion.travel) r.sourceMotionTick = sim.tick;
    let length = null, outward = null, taut = false;
    if (r.joint) {
     const j = r.joint, a = endpoint(sim, j.a, j.anchorA), b = endpoint(sim, j.b, j.anchorB);
     length = Math.hypot(b.x - a.x, b.y - a.y);
     if (length > 0) {
      const source = r.from === j.a ? a : b;
      outward = (r.from === j.a ? -1 : 1) * (source.vx * (b.x - a.x) / length + source.vy * (b.y - a.y) / length);
      taut = length >= j.length - .002 && length <= j.length * 1.01;
     }
    }
    const upstream = contactReport.pass && r.requires.every(c => c.event ? events.some(e => e.id === c.event && e[c.marker] !== null && e[c.marker] !== undefined && e[c.marker] <= sim.tick) : c.constraint ? rows.some(prior => prior.id === c.constraint && prior.eligibleTick !== null && prior.eligibleTick <= sim.tick) : !touching(sim, ...c.clearPair));
    if (r.eligibleTick === null && sourceTravel > r.sourceMotion.travel && outward > .001 && taut && upstream) r.eligibleTick = sim.tick;
    if (r.motionTick === null && recipientTravel > r.motion.travel) {
     r.motionTick = sim.tick; r.lengthAtMotion = length; r.limit = r.joint?.length ?? null; r.outwardAtMotion = outward;
     if (r.eligibleTick === null || r.sourceMotionTick === null || r.sourceMotionTick > r.motionTick) failures.push({type: 'constraint-motion-without-eligible-source', id: r.id, tick: sim.tick});
    }
   }
  },
  report(required = true) {
   const all = [...failures];
   if (required) for (const r of rows) if (r.motionTick === null) all.push({type: 'missing-constraint-handoff', id: r.id});
   return {pass: all.length === 0, failures: all, rows: rows.map(({joint, ...r}) => structuredClone(r))};
  }
 };
}
