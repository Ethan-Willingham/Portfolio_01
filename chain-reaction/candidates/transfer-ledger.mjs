// Combine physical observations without relabeling rope tension as contact.
export function validateTransferOrder(definition, constraints, order) {
 const ids = [...definition.steps.map(s => s.id), ...constraints.map(s => s.id)];
 if (new Set(ids).size !== ids.length) throw Error('Transfer IDs must be unique across contacts and constraints');
 if (!Array.isArray(order) || order.length < 3 || order.length > 12 || order.length !== ids.length || new Set(order).size !== order.length || order.some(id => !ids.includes(id))) throw Error('Transfer order must include every physical handoff exactly once');
 const contactOrder = order.filter(id => definition.steps.some(s => s.id === id));
 if (JSON.stringify(contactOrder) !== JSON.stringify(definition.steps.map(s => s.id))) throw Error('Contact order differs from its observer');
 for (const c of constraints) for (const cause of c.requires) {
  const id = cause.event || cause.constraint;
  if (id && order.indexOf(id) >= order.indexOf(c.id)) throw Error('Transfer cause must precede its recipient');
 }
 return true;
}
export function transferLedger(definition, declarations, order, contacts, constraints, required = true) {
 validateTransferOrder(definition, declarations, order);
 const failures = [], rows = order.map(id => {
  const declaration = definition.steps.find(s => s.id === id) || declarations.find(s => s.id === id);
  const observation = declaration.kind === 'rope' ? constraints.rows.find(r => r.id === id) : contacts.events.find(r => r.id === id);
  const tick = declaration.kind === 'contact' ? observation?.contactTick : observation?.motionTick;
  const moved = Number.isInteger(observation?.motionTick);
  const eligible = declaration.kind !== 'rope' || Number.isInteger(observation?.eligibleTick) && observation.eligibleTick <= observation.motionTick;
  if (required && (!Number.isInteger(tick) || !moved)) failures.push({type: 'missing-ledger-transfer', id});
  if (moved && !eligible) failures.push({type: 'ineligible-ledger-transfer', id});
  return {id, kind: declaration.kind, from: declaration.from, to: declaration.to, tick: Number.isInteger(tick) ? tick : null, motionTick: observation?.motionTick ?? null, ...(declaration.kind === 'rope' ? {eligibleTick: observation?.eligibleTick ?? null} : {})};
 });
 let prior = null;
 for (const row of rows) if (row.tick !== null) {
  if (prior && row.tick < prior.tick) failures.push({type: 'ledger-out-of-order', prior: prior.id, id: row.id, tick: row.tick});
  prior = row;
 }
 if (!contacts.pass) failures.push({type: 'contact-observer-failed'});
 if (!constraints.pass) failures.push({type: 'constraint-observer-failed'});
 return {pass: failures.length === 0, failures, count: rows.length, rows};
}
