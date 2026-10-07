import {watchConstraints} from './constraint-observer.mjs';
import {watchPacing} from './pacing-observer.mjs';
import {transferLedger} from './transfer-ledger.mjs';
// The same read-only composition runs in Node and browser worlds.
export function watchConnectedStage(sim, definition) {
 const contacts = globalThis.ChainReaction.events.watch(sim, {...definition, steps: definition.steps.filter(s => definition.parts.some(p => p.id === s.from) && definition.parts.some(p => p.id === s.to))});
 const constraints = watchConstraints(sim, definition, contacts, definition.constraintSteps);
 const pacing = watchPacing(sim, definition, contacts, constraints, definition.suspense);
 return {
  sample() {contacts.sample(); constraints.sample(); pacing.sample();},
  report(required = true) {
   const events = contacts.report(required), cords = constraints.report(required), pace = pacing.report();
   const ledger = transferLedger(definition, definition.constraintSteps, definition.transferOrder, events, cords, required);
   return {pass: events.pass && cords.pass && pace.pass && ledger.pass, events, constraints: cords, pacing: pace, ledger};
  }
 };
}
