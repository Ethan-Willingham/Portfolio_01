/* Sprint apparatus: real heat, smoke projection and native water, with draft limits. */
(function(root){
  'use strict';
  var entries=[
    {id:'candle-in-jar',capability:'Fire',title:'Candle in a jar',cue:'Keep the lid closed and the candle uses up its air. Lift it while the flame is still burning to let fresh air in.',status:'PARTLY',blocker:'Oxygen is a well-mixed chamber inventory; spatial gas chemistry and pressure are approximate.',draft:true,world:{w:720,h:400},pool:false},
    {id:'chimney-draw',capability:'Fire',title:'Chimney draft',cue:'Close the inlet to starve the flame. Reopen it to revive the fire.',status:'PARTLY',blocker:'Air supply uses a mixed firebox charge, not resolved combustion chemistry.',draft:true,world:{w:720,h:400},pool:false},
    {id:'slime-sauna',capability:'Fire',title:'Slime sauna',cue:'Pour over the hot stones beside the bathing slime, draft.',status:'PARTLY',blocker:'Water warms, but steam and slime temperature are not connected.',draft:true,world:{w:720,h:400},pool:false},
    {id:'heron-air-smoke',capability:'Smoke',title:"The air in Heron's fountain",cue:'Pour into the basin and follow the smoke in the air link, draft.',status:'PARTLY',blocker:'Smoke traces a separate flow field, not the native compressible gas inventory.',draft:true,world:{w:720,h:400},pool:false},
    {id:'sewer-gas-trap',capability:'Smoke',title:'Sewer gas trap',cue:'Compare the water seal with a dry trap, draft.',status:'PARTLY',blocker:'The smoke feels water occupancy; smoke pressure does not move the water seal.',draft:true,world:{w:720,h:400},pool:false}
  ];
  function rect(x,y,width,height){return {x:x,y:y,width:width,height:height};}
  function base(id,world,options){
    if(world.w!==720 || world.h!==400 || world.tile!==8)throw Error('These drafts need a 720 by 400 world.');
    var entry=entries.find(function(e){return e.id===id;});
    return {name:id,title:entry.title,seed:options.seed||17,draft:true,status:entry.status,blocker:entry.blocker,caption:entry.cue,
      action:'Pour water',primary:{kind:'fire-pour'},readingLabel:entry.title,setup:'ordinary',setups:[],
      viewBounds:rect(72,24,576,360),vessels:[],pipes:[],solids:[],vents:[],parts:[],slimes:[],initial:[],marks:[],meters:[],settings:{},boundaries:null,
      boundaryNote:'Draft apparatus. Every water parcel stays in the native liquid solver. Smoke is the existing advected temperature and projection field.',
      energyBudgetStatus:entry.blocker+' The existing fire is a lumped hot fuel patch and declared ember. Smoke and water coupling is approximate, with no closed energy claim.',
      measure:{source:rect(8,8,704,384),receiver:rect(8,8,704,384)},draftFireSmoke:{kind:id,pressure:false,labels:[],tracers:[],probes:[]}};
  }
  function fire(d,x,y,pour){d.fire={source:rect(x-8,y-8,16,16),x:x,y:y,noEmber:false,pour:pour};}
  function make(id,world,options){
    options=options||{};var d=base(id,world,options),q=d.draftFireSmoke;
    if(id==='candle-in-jar'){
      var jar=rect(232,64,248,312),lid=rect(232,64,248,8),opened=options.opened===true;
      d.vessels=[{id:'jar',label:'Jar',rect:jar,sealed:true}];d.solids=[rect(344,312,32,56)];if(opened)d.vents.push(lid);
      fire(d,360,296,{x:360,y:112});d.action=opened?'Replace lid':'Lift lid';d.primary={kind:'draft-wall-toggle'};
      var metresPerPixel=.762/world.w;
      d.fire.noEmber=true;d.fire.air={volumeLitres:((jar.width-16)*(jar.height-16)-32*56)*metresPerPixel*metresPerPixel*.0254*1000,
        consumptionLitresPerSecond:.008,extinctionFraction:.16,openExchangePerSecond:1.5};
      d.energyBudgetStatus='The sealed jar has a finite, well-mixed oxygen inventory. Burning consumes it; an open lid exchanges air with the room. The flame weakens near the tuned cutoff and stays out after extinction until reset. There is no reheating ember. Spatial oxygen transport, combustion products and gas pressure are approximate; the source heat ledger retains the existing lumped model.';
      q.gate={rect:lid,opened:opened,openLabel:'Replace lid',closedLabel:'Lift lid'};q.labels=[{x:252,y:48,text:'Glass lid'},{x:302,y:366,text:'Candle'}];q.probes=[{id:'jar',x:360,y:192},{id:'above-lid',x:360,y:40}];
    }else if(id==='chimney-draw'){
      var inlet=rect(216,312,8,48),closed=options.closed===true;
      d.vessels=[{id:'firebox',label:'Firebox',rect:rect(216,248,304,136),sealed:true}];
      d.solids=[rect(320,40,8,216),rect(392,40,8,216),rect(328,352,16,8),rect(376,352,16,8)];d.vents=[rect(328,248,64,8)];if(!closed)d.vents.push(inlet);
      fire(d,360,328,{x:472,y:104});d.action=closed?'Open inlet':'Close inlet';d.primary={kind:'draft-wall-toggle'};
      d.fire.ventilation=true;
      d.energyBudgetStatus='The clear inlet replenishes a finite mixed air charge. Burning consumes it and supplies proportional heat and smoke. A declared ember revives dry fuel when air returns. The smoke solver advects heat through the real flue walls; combustion chemistry and a closed air-energy budget remain approximate.';
      q.gate={rect:inlet,opened:!closed,openLabel:'Close inlet',closedLabel:'Open inlet'};q.labels=[{x:104,y:306,text:'Air inlet'},{x:404,y:64,text:'Chimney'}];
      q.tracers=[{x:192,y:328},{x:192,y:344},{x:232,y:332}];q.probes=[{id:'inlet',x:224,y:332},{id:'flue',x:360,y:112}];
    }else if(id==='slime-sauna'){
      d.vessels=[{id:'room',label:'Sauna',rect:rect(96,40,528,344),sealed:true},{id:'tub',label:'Bath',rect:rect(408,288,160,88),sealed:false}];
      d.vents=[rect(616,72,8,32)];d.solids=[rect(224,328,16,8),rect(280,328,16,8)];d.slimes=[{x:488,y:248,radius:24}];
      d.initial=[{kind:'rect',vessel:'tub',rect:rect(416,312,144,48)}];fire(d,256,312,{x:256,y:120});
      q.labels=[{x:174,y:368,text:'Hot stones'},{x:452,y:278,text:'Bathing slime'}];q.probes=[{id:'warm-room',x:360,y:128}];
    }else if(id==='heron-air-smoke'){
      d=root.WaterMachinesScenes.make('heron',world,options);var e=entries[3];
      d.name=id;d.title=e.title;d.draft=true;d.status=e.status;d.blocker=e.blocker;d.caption=e.cue;d.boundaries=null;
      d.boundaryNote='Draft. The existing finite Heron apparatus and native pressure model move the water. Passive smoke starts in the receiving headspace and air link.';
      d.energyBudgetStatus=e.blocker+' Moving water from the existing particle mirror drives the separate incompressible smoke field. Dye carries no imposed momentum.';
      var link=d.pipes.find(function(p){return p.id==='air-link';}),bottom=d.vessels.find(function(v){return v.id==='bottom';}).rect;
      d.draftFireSmoke={kind:id,pressure:true,labels:[{x:bottom.x+24,y:bottom.y-12,text:'Smoke in air link'}],
        tracers:link.points.concat([{x:bottom.x+bottom.width*.5,y:bottom.y+20}]),probes:link.points.map(function(p,i){return {id:'air-link-'+i,x:p.x,y:p.y};})};
    }else if(id==='sewer-gas-trap'){
      var dry=options.dry===true;d.setup=dry?'dry':'wet';d.action=dry?'Try water seal':'Try dry trap';d.primary={kind:'draft-trap-setup',dry:dry};
      d.setups=[{id:'wet',label:'Water seal',options:{dry:false}},{id:'dry',label:'Dry trap',options:{dry:true}}];
      d.pipes=[{id:'trap',points:[{x:112,y:184},{x:256,y:184},{x:256,y:304},{x:432,y:304},{x:432,y:184},{x:608,y:184}],bore:48,primed:false}];
      d.initial=dry?[]:[{kind:'rect',rect:rect(232,260,224,64)}];q.fan={x:144,top:168,bottom:200,spacing:8,acceleration:180};
      q.tracers=[{x:152,y:176},{x:152,y:184},{x:152,y:192}];q.labels=[{x:88,y:144,text:'Sewer fan'},{x:464,y:144,text:'Room outlet'},{x:296,y:364,text:dry?'Dry trap':'Water seal'}];
      q.probes=[{id:'sewer',x:208,y:184},{id:'room-outlet',x:560,y:184}];
      d.energyBudgetStatus='A declared fan supplies air momentum at the left inlet. The native water seal masks the separate smoke flow through existing mirror coupling; air-to-water pressure feedback is absent. Switching wet and dry rebuilds the initial apparatus, not a running drain.';
    }
    return d;
  }
  function create(definition,fluid,world){
    var q=definition.draftFireSmoke,savedPhysics=fluid.getPhysics(),saved={},clock=0,fanImpulse=0;
    ['wind_x','CURL','VELOCITY_DISSIPATION','DENSITY_DISSIPATION','OPTICAL_DENSITY','OPTICAL_BRIGHTNESS'].forEach(function(k){saved[k]=fluid.config[k];});
    fluid.config.wind_x=0;fluid.config.CURL=0;fluid.config.DENSITY_DISSIPATION=.025;
    if(!definition.fire){fluid.setPhysics({HEAT:0,COOLING:0,BUOYANCY:0,WEIGHT:0},0);fluid.setThermalStyle({glow:0});}
    function tracer(x,y,amount){
      var old=fluid.getPhysics();fluid.setPhysics({HEAT:0},0);
      fluid.splat(x/world.w,1-y/world.h,0,0,{r:.26*amount,g:.24*amount,b:.20*amount},.018);fluid.setPhysics(old,0);
    }
    q.tracers.forEach(function(p){tracer(p.x,p.y,.6);});
    if(definition.fire)fluid.splat(definition.fire.x/world.w,1-definition.fire.y/world.h,0,0,{r:.12,g:.11,b:.10},.055);
    function prepare(dt){
      if(!(dt>0))return;clock+=dt;
      if(q.fan){var scale=fluid.config.SIM_RESOLUTION/world.h;
        for(var y=q.fan.top;y<=q.fan.bottom;y+=q.fan.spacing){tracer(q.fan.x+8,y,dt*2);fluid.splatVelocity(q.fan.x/world.w,1-y/world.h,q.fan.acceleration*dt*scale,0,.035);}
        fanImpulse+=q.fan.acceleration*dt;
      }
    }
    function ventilation(){
      if(q.kind!=='chimney-draw' && q.kind!=='candle-in-jar')return 1;
      var r=q.gate.rect,clear=0,total=0,tile=world.tile;
      for(var y=r.y+tile*.5;y<r.y+r.height;y+=tile)for(var x=r.x+tile*.5;x<r.x+r.width;x+=tile){
        total++;if(!world.solidAt(x,y))clear++;
      }
      return total?clear/total:0;
    }
    function stats(sample){
      var report={kind:q.kind,seconds:clock,status:definition.status,blocker:definition.blocker,fanImpulse:fanImpulse,inletOpenFraction:q.kind==='chimney-draw'?ventilation():null,probes:[],error:null};
      if(!sample)return report;var field=fluid.sampleFlow(world.w,world.h);if(!field){report.error='Current smoke flow sample is unavailable.';return report;}
      for(var i=0;i<field.values.length;i++)if(!Number.isFinite(field.values[i])){report.error='Smoke flow contains a non-finite value.';return report;}
      q.probes.forEach(function(p){var col=Math.max(0,Math.min(field.width-1,Math.floor(p.x/world.w*field.width))),row=Math.max(0,Math.min(field.height-1,Math.floor((1-p.y/world.h)*field.height))),at=(row*field.width+col)*4;
        report.probes.push({id:p.id,vx:field.values[at],vy:-field.values[at+1],pressure:field.values[at+2],dye:field.values[at+3]});});return report;
    }
    return {prepare:prepare,stats:stats,ventilation:ventilation,draw:function(c){q.labels.forEach(function(label){c.fillText(label.text,label.x,label.y);});},
      destroy:function(){Object.keys(saved).forEach(function(k){fluid.config[k]=saved[k];});fluid.setPhysics(savedPhysics,0);}};
  }
  root.WSSMachines=root.WSSMachines||{};entries.forEach(function(entry){root.WSSMachines[entry.id]={make:function(world,options){return make(entry.id,world,options);}};});
  root.WSSFireSmokeDrafts={create:create,entries:entries};
})(typeof window!=='undefined'?window:globalThis);
