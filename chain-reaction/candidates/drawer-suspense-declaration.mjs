export function drawerSuspense(definition) {
 const d = definition.suspense;
 if (!d || Array.isArray(d) || d.maximumSeconds !== 3 || d.start !== .30 || d.endEvent !== 'outlet-opening') throw Error('Unknown drawer suspense declaration');
 return {id: d.id, maximumSeconds: 3, start: {kind: 'prismatic-coordinate', a: d.joint.a, b: d.joint.b, atLeast: d.start}, end: {event: d.endEvent, marker: 'motionTick'}, requires: [{constraint: 'drawer-pull'}, {event: 'arrival-trip'}]};
}
