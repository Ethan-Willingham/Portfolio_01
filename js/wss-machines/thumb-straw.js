/* Open-ended straw with a real upper cap and optional upper gas vent.
 * Held/secondHole select boundary geometry before the first native update.
 */
(function (root) {
  'use strict';
  function make(world, options) {
    options = options || {};
    if (!world || world.w !== 720 || world.h !== 400 || (world.tile || 8) !== 8)
      throw new Error('Thumb straw needs a 720 by 400 world with 8-pixel walls.');
    ['held', 'secondHole'].forEach(function (key) {
      if (options[key] !== undefined && typeof options[key] !== 'boolean')
        throw new Error('Straw ' + key + ' must be a boolean.');
    });
    var held = options.held === true, secondHole = options.secondHole === true;
    var source = {x:336, y:80, width:32, height:136};
    var receiver = {x:16, y:288, width:688, height:96};
    var gas = {x:344, y:80, width:16, height:32};
    var water = {x:344, y:112, width:16, height:96};
    var opening = {axis:'y', at:80, start:344, end:360};
    var vent = {x:360, y:88, width:8, height:8};
    return {
      name:'thumb-straw', title:'The straw and the thumb',
      viewBounds:{x:16, y:72, width:688, height:312},
      action:'Hold the top', actionNote:'Hold starts a filled straw.',
      caption:secondHole
        ? 'The upper side hole connects the air above the water to the room. Hold the top and compare this opening with the intact straw.'
        : 'The open straw begins draining into the lower tank. Hold the top to start a filled straw with its upper opening sealed.',
      setup:secondHole ? 'second-hole' : held ? 'held' : 'released',
      seed:options.seed || 17,
      vessels:[{id:'receiver', rect:receiver, sealed:false}],
      pipes:[],
      // Only wall banks run beside the straw. Neither end has a solid plug.
      solids:[{x:336, y:80, width:8, height:128}, {x:360, y:80, width:8, height:128}],
      vents:secondHole ? [Object.assign({}, vent)] : [], vent:vent,
      initial:[{kind:'rect', vessel:'straw', rect:water}],
      slimes:[], parts:[],
      meters:[{id:'outlet', a:{x:344, y:208}, b:{x:360, y:208}, axis:'y', positive:1}],
      marks:[{id:'initial-water', x:344, y:112, width:16}],
      primary:{kind:'thumb', opening:opening},
      settings:{particlePressure:true, projectedVelocity:true, directGather:true,
        collapseEmptyCells:true, geometricGas:true, nonlinearGas:true, vaporClosure:true,
        boundaryReconstruction:true, cellSize:8, soundSpeed:2500, iterations:32,
        redBlack:true, roomPressurePsi:14.7, minimumPressure:-80000},
      boundaries:{pool:false, tap:null, drain:null, reservoirY:376,
        caps:held ? [Object.assign({}, opening)] : []},
      measure:{source:source, receiver:receiver,
        straw:{x:344, y:80, width:16, height:128},
        gas:gas, initialWater:water, gasProbe:{x:352, y:96},
        opening:opening, secondHole:vent, outlet:{x:352, y:208}, bore:16, sourceLevel:112}
    };
  }
  root.WSSMachines = root.WSSMachines || {};
  root.WSSMachines['thumb-straw'] = {make:make};
})(typeof window !== 'undefined' ? window : globalThis);
