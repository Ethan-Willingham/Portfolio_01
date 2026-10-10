/* The released cup, filled by a declared native tap and recycling collector.
 * This module supplies geometry and initial water only. The solver owns motion.
 */
(function (root) {
  'use strict';
  function make(world, options) {
    options = options || {};
    if (!world || world.w !== 720 || world.h !== 400 || (world.tile || 8) !== 8)
      throw new Error('Self-flushing cup needs a 720 by 400 world with 8-pixel walls.');
    if (!root.WaterMachinesScenes) throw new Error('The released cup definition is unavailable.');
    ['vented', 'tapEnabled'].forEach(function (key) {
      if (options[key] !== undefined && typeof options[key] !== 'boolean')
        throw new Error('Cup ' + key + ' must be a boolean.');
    });
    var rate = options.tapRate === undefined ? 320 : options.tapRate;
    if (!Number.isFinite(rate) || rate < 0) throw new Error('Cup tapRate must be nonnegative parcels per second.');
    var velocityY = options.tapVelocityY === undefined ? 0 : options.tapVelocityY;
    if (!Number.isFinite(velocityY) || velocityY < 0)
      throw new Error('Cup tapVelocityY must be nonnegative world pixels per second.');
    var definition = root.WaterMachinesScenes.make('cup', world, {seed:options.seed, bore:16, crest:180, level:200});
    var source = definition.measure.source, floor = source.y + source.height - 8;
    // Preserve the narrow descending stem and repaired cup floor. The grate
    // and suspended drop-slime belong to the original cup, not this setup.
    definition.solids = definition.solids.filter(function (r) {
      return r.x >= source.x + source.width || r.y === floor;
    });
    // The stock 16-pixel rising bore feeds an 8-pixel descending stem. The
    // lowered crest shortens the physical fill and discharge range.
    definition.measure.bore = 8;
    definition.measure.risingBore = 16;
    definition.measure.intakeOpening = {x:512, y:216, width:8, height:16};
    definition.slimes = [];
    definition.parts = [];
    definition.name = 'self-flushing-cup';
    definition.title = 'Self-flushing cup';
    definition.setup = options.vented ? 'vented' : options.tapEnabled === false ? 'tap-off' : 'tap-on';
    definition.action = options.tapEnabled === false ? 'Open tap' : 'Close tap';
    definition.caption = options.vented
      ? 'The opening above the crest lets room air enter the drain. Compare it with the closed crest to see whether the tube sustains a full discharge.'
      : 'The tap raises the water above the drain\'s crest. Once the tube fills, the cup can empty until air reaches the intake.';
    definition.primary = {kind:'tap'};
    // This clears a roof cell over the horizontal crest, outside the cup.
    // It changes both parcel passage and pressure topology through the builder.
    definition.vent = {x:584, y:168, width:8, height:8};
    definition.vents = options.vented ? [Object.assign({}, definition.vent)] : [];
    definition.boundaries = {
      pool:true,
      tap:{x:192, y:64, vx:0, vy:velocityY, rate:rate, enabled:options.tapEnabled !== false, width:16, height:5},
      drain:{x:24, y:360, width:672, height:16},
      reservoirY:376,
      caps:[]
    };
    return definition;
  }
  root.WSSMachines = root.WSSMachines || {};
  root.WSSMachines['self-flushing-cup'] = {make:make};
})(typeof window !== 'undefined' ? window : globalThis);
