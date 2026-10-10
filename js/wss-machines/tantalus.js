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
    definition.slimes.push({x:112, y:152, radius:24, held:false});
    definition.solids.push({x:32, y:176, width:128, height:8});
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
