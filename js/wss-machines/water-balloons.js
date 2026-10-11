/* A partly filled, draggable elastic membrane holds real native water. */
(function(root){
  'use strict';
  function make(world,options){
    options=options || {};if(world.w!==720 || world.h!==400 || world.tile!==8)throw Error('Water balloons need a 720 by 400 world.');
    var basin={x:112,y:304,width:496,height:80};
    return {name:'water-balloons',title:'Water balloons',seed:options.seed || 17,setup:options.slit?'slit':'closed',
      action:'Pop the balloon',primary:{kind:'balloon-pop'},readingLabel:'Water inside the skin',
      setups:[{id:'closed',label:'Closed balloon',options:{slit:false}},{id:'slit',label:'A slit in the skin',options:{slit:true}}],
      caption:'Water pushes perpendicular to the skin that contains it. Drag this partly filled balloon, let it bounce, then pop its elastic skin to release the same water in this flat model.',
      source:{title:'OpenStax, Fluids, Density, and Pressure',url:'https://openstax.org/books/university-physics-volume-1/pages/14-1-fluids-density-and-pressure'},
      boundaryNote:'A smooth quadratic elastic skin contains native water at rest spacing. Native two-sided contacts use adaptively subdivided segments of that same curve. Each resident slot receives its immutable birth side from its actual GPU position; moving contacts preserve that side. Twenty parameter intervals define the slit choices, and a twenty-edge enclosing polygon supplies the coarse boundary registration. The comparison removes one lower-side interval of the curve, exposing a hole above the basin floor so water can cross it. Pop removes the skin and its gel nodes while leaving every water parcel and velocity in the native solver. Drag and fling use Grab.',
      energyBudgetStatus:'Native water contact impulses load the existing elastic gel ring with the equal and opposite reaction. A small current GPU packet carries the contact frame and simulation time, with asynchronous feedback to the CPU gel. Water parcel mass is 0.002 and each gel node mass is 0.09 in normalized model units. Tangential water motion is free; normal contacts are inelastic. The adaptive curve contacts and elastic gel lattice approximate a membrane in two dimensions. This is not calibrated rubber, a three-dimensional balloon, or a closed energy budget; there is no prescribed fill outline or balloon motion.',
      viewBounds:{x:104,y:80,width:512,height:304},vessels:[{id:'basin',rect:basin,sealed:false}],pipes:[],solids:[],vents:[],parts:[],
      initial:[{kind:'rect',rect:{x:288,y:176,width:144,height:88}}],slimes:[{x:360,y:192,radius:64}],marks:[],meters:[],settings:{},boundaries:null,
      membrane:{slit:!!options.slit,freeSurface:176},measure:{source:basin,receiver:basin}};
  }
  root.WSSMachines=root.WSSMachines || {};root.WSSMachines['water-balloons']={make:make};
})(typeof window!=='undefined'?window:globalThis);
