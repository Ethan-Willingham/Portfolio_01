/* Finite hydrostatic load on an ideal, initially intact rupture membrane. */
(function (root) {
  'use strict';
  function make(world, options) {
    options=options || {};
    if(!world || world.w!==720 || world.h!==400 || (world.tile || 8)!==8)
      throw new Error('Burst disk needs a 720 by 400 world with 8-pixel walls.');
    ['stronger','closed'].forEach(function(k){if(options[k]!==undefined && typeof options[k]!=='boolean')throw new Error('Disk '+k+' must be a boolean.');});
    var seed=options.seed===undefined ? 17 : options.seed;
    if(!Number.isInteger(seed) || seed<1 || seed>4294967295)throw new Error('Disk seed must be a positive 32-bit integer.');
    var source={x:112,y:64,width:184,height:224},receiver={x:16,y:312,width:688,height:72};
    var pipe={points:[{x:280,y:220},{x:440,y:220}],bore:24};
    var opening={axis:'x',at:328,start:208,end:232},disk={axis:'x',at:368,start:208,end:232};
    var stronger=options.stronger===true,closed=options.closed===true;
    return {
      name:'burst-disk',title:'The burst disk',seed:seed,predictionKind:'burst-disk',
      viewBounds:{x:16,y:42,width:688,height:342},
      setup:stronger ? 'stronger' : 'ordinary',
      setups:[{id:'ordinary',label:'Ordinary disk',options:{stronger:false}},
        {id:'stronger',label:'Stronger disk',options:{stronger:true}}],
      readingLabel:'Finite water',action:closed ? 'Open intake' : 'Close intake',
      caption:'Pressure on the two sides of a rupture disk can break it open, and it stays open after the pressure falls. This finite tank drives a once-only discharge; compare the stronger disk in a fresh setup.',
      source:{title:'NASA Stennis, Relief Devices, Inspection and Testing',url:'https://ssctdpub.ssc.nasa.gov/servlet/sm.web.Fetch/SSTD-8070-0097-TEST_B.pdf?did=44175&rhid=1000&type=released'},
      boundaryNote:'The tank and the upstream channel start with finite water. Each native substep compares the mean gauge pressures immediately beside the disk. The ordinary disk opens at a diagnostic 3 1/3-inch water head; the stronger control needs 166 2/3 inches. The ideal membrane has no deflection, mass, fragments or fracture energy. It never recloses. The intake cap can close without refilling.',
      energyBudgetStatus:'Gravity supplies the water energy. The ideal disk displaces no volume and contributes zero pressure work or fracture energy. No tap, drain, prescribed discharge or powered return changes the inventory. A moving seat with mass, spring and damping is not modeled.',
      vessels:[{id:'source',rect:source,sealed:false},{id:'receiver',rect:receiver,sealed:false}],
      pipes:[pipe],solids:[],vents:[],slimes:[],parts:[],
      initial:[{kind:'rect',vessel:'source',rect:{x:120,y:88,width:168,height:192}},
        {kind:'rect',rect:{x:280,y:208,width:88,height:24}}],
      meters:[{id:'outlet',a:{x:440,y:208},b:{x:440,y:232},axis:'x',positive:1}],
      marks:[],primary:{kind:'cap',opening:opening,closed:closed,label:'Intake',openLabel:'Close intake',closedLabel:'Open intake'},
      settings:{particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,
        geometricGas:true,nonlinearGas:true,vaporClosure:true,boundaryReconstruction:true,
        cellSize:8,soundSpeed:2500,iterations:32,redBlack:true,roomPressurePsi:14.7,minimumPressure:-80000},
      boundaries:{pool:false,tap:null,drain:null,caps:closed ? [Object.assign({},opening)] : [],
        burstDisk:{opening:disk,strength:stronger ? 1000000 : 20000,direction:1}},
      measure:{source:source,receiver:receiver,sourceLevel:88,outlet:{x:440,y:220},bore:24,
        intakeFloor:232,sourceFloor:280,disk:disk,flowSection:Object.assign({positive:1},opening)}
    };
  }
  root.WSSMachines=root.WSSMachines || {};
  root.WSSMachines['burst-disk']={make:make};
})(typeof window!=='undefined'?window:globalThis);
