/* A finite, initially primed valley pipe. MLS-MPM owns all subsequent motion. */
(function (root) {
  'use strict';
  function make(world, options) {
    options = options || {};
    if (!world || world.w !== 720 || world.h !== 400 || (world.tile || 8) !== 8)
      throw new Error('The inverted siphon needs a 720 by 400 world with 8-pixel walls.');
    ['sameHead', 'closed'].forEach(function (key) {
      if (options[key] !== undefined && typeof options[key] !== 'boolean')
        throw new Error('Inverted siphon ' + key + ' must be a boolean.');
    });
    var sameHead = options.sameHead === true, closed = options.closed === true;
    var shift = sameHead ? 96 : 0;
    var source = {x:40, y:64, width:160, height:152};
    var receiver = {x:552, y:160-shift, width:128, height:144};
    var sourceLevel = 96, receiverLevel = 192-shift;
    var route = [{x:164,y:164}, {x:244,y:164}, {x:244,y:292},
      {x:508,y:292}, {x:508,y:196-shift}, {x:612,y:196-shift}];
    var opening = {axis:'x', at:160, start:160, end:176};
    var outlet = {x:624, y:200-shift};
    return {
      name:'roman-inverted-siphon', title:'Roman inverted siphon', seed:options.seed || 17,
      setup:sameHead ? 'same-head' : 'lower-receiver', action:closed ? 'Open intake' : 'Close intake',
      caption:'Vitruvius described pipes crossing a valley floor and rising up the far side. '+
        (sameHead ? 'With both water surfaces at the same height, gravity supplies no steady head for delivery.' :
          'This pipe starts full, and the higher reservoir supplies the pressure for the climb.'),
      source:{title:'Vitruvius, On Architecture 8.6.5', url:'https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Vitruvius/8%2A.html#6.5'},
      viewBounds:{x:32,y:48,width:656,height:272},
      vessels:[{id:'source',label:'Source reservoir',rect:source,sealed:false},
        {id:'receiver',label:sameHead ? 'Same-height receiver' : 'Lower reservoir',rect:receiver,sealed:false}],
      pipes:[{id:'valley-pipe',points:route,bore:16,primed:true}],
      initial:[{kind:'pipe',points:route,bore:16,tile:8},
        {kind:'rect',vessel:'source',rect:{x:48,y:sourceLevel,width:144,height:112}},
        {kind:'rect',vessel:'receiver',rect:{x:560,y:receiverLevel,width:112,height:104}}],
      slimes:[], solids:[], vents:[], parts:[],
      meters:[{id:'delivery',axis:'x',positive:1,a:{x:624,y:192-shift},b:{x:624,y:208-shift}}],
      marks:[{id:'source-level',x:source.x,y:sourceLevel,width:source.width},
        {id:'receiver-level',x:receiver.x,y:receiverLevel,width:receiver.width}],
      primary:{kind:'cap',opening:opening,closed:closed,openLabel:'Close intake',closedLabel:'Open intake',label:'Intake'},
      boundaries:{pool:false,tap:null,drain:null,caps:closed ? [opening] : []},
      predictionKind:'siphon',
      energyBudgetStatus:'The pipe starts full, with no pump, tap or drain. Gravity transfers stored water; closing the intake removes flow energy.',
      settings:{particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,
        geometricGas:true,boundaryReconstruction:true,cellSize:8,soundSpeed:2500,iterations:32,redBlack:true,
        atmospherePressure:100000,minimumPressure:-80000},
      measure:{source:source,receiver:receiver,sourceLevel:sourceLevel,receiverLevel:receiverLevel,
        intake:{x:164,y:164},intakeOpening:{x:152,y:160,width:8,height:16},intakeFloor:176,
        outlet:outlet,bore:16,flowSection:{axis:'x',at:624,start:192-shift,end:208-shift,positive:1},
        risingSection:{x:504,y:240,width:16,height:8},risingViewRegion:{x:496,y:232,width:32,height:24},
        prime:true,headControl:sameHead}
    };
  }
  root.WSSMachines = root.WSSMachines || {};
  root.WSSMachines['roman-inverted-siphon'] = {make:make};
})(typeof window !== 'undefined' ? window : globalThis);
