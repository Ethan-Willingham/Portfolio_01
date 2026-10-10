/* A passive slime and fixed finite mouth probe beside the same physical cup.
 * The mouth is a measurement region, never a collision body or water boundary.
 */
(function (root) {
  'use strict';
  function make(world, options) {
    options = options || {};
    var cup = root.WSSMachines && root.WSSMachines['self-flushing-cup'];
    if (!cup) throw new Error('The self-flushing cup definition is unavailable.');
    var definition = cup.make(world, options);
    definition.name = 'tantalus';
    definition.title = 'Tantalus';
    var tile = world.tile || 8;
    var tube = definition.pipes.find(function (pipe) { return pipe.id === 'cup-drain'; });
    if (!tube) throw new Error('The Tantalus intake route is unavailable.');
    // Raise the actual intake bend two cells. The crest, stem and outlet stay put.
    tube.points[0].y -= tile * 2;
    tube.points[1].y -= tile * 2;
    var cellsAcross = Math.ceil(tube.bore / tile), low = Math.floor((cellsAcross - 1) / 2);
    var mouth = tube.points[0], bend = tube.points[1], crest = tube.points[2];
    definition.measure.intake = {x:mouth.x, y:mouth.y};
    definition.measure.intakeOpening = {
      x:(Math.floor(mouth.x / tile) - 1) * tile,
      y:(Math.floor(mouth.y / tile) - low) * tile,
      width:tile, height:cellsAcross * tile
    };
    definition.measure.intakeFloor = definition.measure.intakeOpening.y + cellsAcross * tile;
    // This complete open section is in the upright, above the raised intake.
    definition.measure.risingSection = {
      x:(Math.floor(bend.x / tile) - low) * tile,
      y:definition.measure.intakeOpening.y - tile,
      width:cellsAcross * tile, height:tile
    };
    var section = definition.measure.risingSection;
    definition.measure.risingViewRegion = {x:section.x - tile, y:section.y - tile,
      width:section.width + tile * 2, height:tile * 3};
    definition.measure.crestSection = {
      x:Math.round((crest.x + tube.points[3].x) / (2 * tile)) * tile,
      y:(Math.floor(crest.y / tile) - low) * tile, width:tile, height:cellsAcross * tile
    };
    // Keep the declared supply away from the fixed mouth and physical slime.
    definition.boundaries.tap.x = 432;
    definition.slimes.push({x:112, y:152, radius:24, held:false});
    definition.solids.push({x:32, y:176, width:128, height:8});
    // A visible passive lip keeps the unfrozen body on its shelf.
    definition.solids.push({x:24, y:120, width:8, height:64});
    definition.measure.mouth = {x:156, y:152, width:16, height:8};
    definition.measure.mouthLine = 156;
    definition.measure.mouthCenter = {x:164, y:156};
    definition.marks.push({id:'mouth-line', x:156, y:156, width:16});
    definition.caption = options.vented
      ? 'The mouth line stays fixed above the drain\'s crest. The opening in the crest lets room air into the tube, changing how the cup drains.'
      : 'The tap fills toward the fixed mouth line above the drain\'s crest. Once the tube fills, it can pull the water back below the intake.';
    return definition;
  }
  root.WSSMachines = root.WSSMachines || {};
  root.WSSMachines.tantalus = {make:make};
})(typeof window !== 'undefined' ? window : globalThis);
