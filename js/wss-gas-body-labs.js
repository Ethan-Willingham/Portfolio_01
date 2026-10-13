/* Isothermal chamber and airway inventories coupled to the current elastic skin. */
(function(root){
  'use strict';
  function rect(x,y,width,height){return{x:x,y:y,width:width,height:height};}
  function area(points){var sum=0;for(var i=0;i<points.length;i++){var p=points[i],q=points[(i+1)%points.length];sum+=p.x*q.y-q.x*p.y;}return Math.abs(sum)*.5;}
  function inner(b){return root.WSSCartesianDivers.area(b);}
  function make(id,w,o){
    o=o||{};var fish=id==='swim-bladder-fish',lungs=id==='bell-jar-lungs';
    var d=root.WSSMachines['cartesian-divers'].make(w,{seed:o.seed,squeezed:false});
    d.name=id;d.title=fish?'Swim-bladder fish':lungs?'Bell-jar lungs':'Slime in a vacuum jar';d.draft=true;
    d.source={title:lungs?'OpenStax, The Process of Breathing':'NASA, Boyle\'s Law',url:lungs?'https://openstax.org/books/anatomy-and-physiology-2e/pages/22-3-the-process-of-breathing':'https://www.grc.nasa.gov/WWW/k-12/BGP/boyle.html'};
    d.gasBodyLab={kind:fish?'fish':lungs?'lungs':'vacuum',vented:!!o.vented,blocked:!!o.blocked,motor:o.motor!==false,pumped:false,stroke:80,speed:40,offset:0,piston:rect(200,272,320,16),elasticity:fish?.20:lungs?.24:.08,airwayTime:fish?.75:.32};
    d.parts=[];d.pipes=[];d.solids=[];d.vents=[];d.boundaries=null;
    if(fish){
      d.vessels=[{id:'tank',label:'Water',rect:rect(200,120,320,264),sealed:false}];
      d.initial=[{kind:'rect',rect:rect(216,184,288,184)}];d.slimes=[{x:360,y:240,radius:30,density:1.14}];
      d.solids=[rect(192,376,336,16),rect(192,120,16,272),rect(512,120,16,272)];
      d.divers.noPiston=true;d.divers.fixedArea=true;d.divers.dragRate=6;d.divers.viscosity=1.2;
      d.settings.minimumPressure=root.WaterMachinesInstruments.scale({width:720,density:1}).pressureFromPsi(.339-14.7);
      d.primary={kind:'gas-body-pump',target:rect(312,96,96,28)};d.action='Fill bladder';d.viewBounds=rect(176,80,368,312);
      d.setups=[{id:'open',label:'Gas supply connected',options:{}},{id:'blocked',label:'Blocked gas supply',options:{blocked:true}}];d.setup=o.blocked?'blocked':'open';
      d.caption='Fill the bladder to rise. Vent it to sink. The ballast stays in the fish.';
      d.boundaryNote='The valve connects the gas bladder to a declared pressure supply or to its room-reference vent. Gas enters and leaves through a finite resistance; its signed inventory is recorded. Measured native water depth supplies hydrostatic outside pressure. That pressure and elastic recoil set the gas volume. Actual rendered skin area divided by fixed ballast mass sets the existing whole-tank hydrostatic buoyancy. The same smooth skin displaces native water. No depth or body velocity is prescribed.';
      d.energyBudgetStatus='The external gas supply provides compression work. Water remains in the MLS-MPM solver. This is a compressible gas-slime stand-in for a swim bladder, with a fixed ballast, approximate one-way hydrostatic lift and water drag, and no closed gas-water energy claim.';
    }else{
      delete d.divers;d.settings={enabled:false};d.draftGravity=0;
      d.vessels=[{id:'jar',label:'Air chamber',rect:rect(200,88,320,296),sealed:true}];d.initial=[];
      d.slimes=lungs?[{x:288,y:200,radius:38},{x:432,y:200,radius:38}]:[{x:360,y:200,radius:48}];
      d.parts=[{id:'jar-vent',type:'valve',rect:rect(192,136,24,16),open:!!o.vented}];
      d.vents=[rect(192,136,24,16),rect(504,360,24,16)];
      d.primary={kind:'gas-body-piston'};d.action=d.gasBodyLab.motor?'Raise diaphragm':'Lower diaphragm';d.viewBounds=rect(176,48,368,352);
      d.setups=[{id:'sealed',label:'Sealed jar',options:{}},{id:'vented',label:'Open jar vent',options:{vented:true}},{id:'still',label:'Motor stopped',options:{motor:false}}];
      if(lungs)d.setups.push({id:'blocked',label:'Blocked lung tubes',options:{blocked:true}});
      d.setup=o.vented?'vented':o.motor===false?'still':o.blocked?'blocked':'sealed';
      d.caption=lungs?'Lower the diaphragm to draw air into the lungs. Raise it to breathe out.':'Pull the diaphragm down to lower the air pressure and swell the slime. Raise it to shrink it again.';
      d.boundaryNote='The visible motor moves a solid diaphragm. The sealed cavity contains a finite isothermal gas inventory: pressure is gas amount divided by its actual current volume. The volume subtracts the current drawn slime skins and any native water poured into the jar. Opening the real side vent admits room air through a finite resistance. '+(lungs?'Each lung has its own gas inventory and a flexible tube to room air. Its pressure difference drives admission and expiration through the tube resistance. Blocking the tubes keeps each lung\'s gas amount fixed.':'The slime keeps its initial gas amount; it expands as outside pressure falls.')+' Elastic recoil and gas pressure set an equilibrium area for the ordinary elastic skin. Only each support center is pinned; no node follows an authored shape or breathing trajectory.';
      d.energyBudgetStatus='The motor supplies pressure-volume work recorded by the reduced model. This is a reduced, well-mixed isothermal gas model in a two-dimensional jar, with an elastic gas skin and ideal flexible airway tubes. The gas inventories and vent transfers balance explicitly. Spatial gas inertia, tissue physiology and a closed thermal-energy budget are not resolved. The solid diaphragm and water, when added, use native collision. Added water reduces the gas volume, but uniform chamber pressure is not fed back onto added water.';
    }
    d.setupNote='Each comparison starts from the same apparatus and inventories. The open vent removes the chamber pressure difference; a blocked gas connection admits no air.';
    d.measure={source:d.vessels[0].rect,receiver:d.vessels[0].rect};return d;
  }
  var previous=root.WSSDraftRuntime;
  function create(c){
    var d=c.definition,s=d.gasBodyLab;if(!s)return previous&&previous.create?previous.create(c):null;
    var fish=s.kind==='fish',L=c.liquid,clock=L.simulationClock,time=0,retired=false,error=null;
    c.bodies.forEach(function(b){b.gasBodySkin=true;});
    var models=c.bodies.map(function(b){var volume=area(c.skinRing(b)),a=inner(b);return{body:b,initial:volume,volume:volume,inner:a,target:volume,amount:volume,admitted:0,expired:0,pressure:1,outside:1,cx:b.cx,cy:b.cy};});
    var jar=d.vessels[0].rect,chamber={initial:0,amount:0,admitted:0,expired:0,volume:0,pressure:1,work:0},waterArea=0;
    if(fish){models.forEach(function(m){m.body.cartesianDiver.mass=m.initial*1.14;});c.divers.skinRing=c.skinRing;var oldTick=c.divers.tick;c.divers.tick=function(){oldTick();models.forEach(targetArea);};}
    function ventOpen(){var part=d.parts.find(function(p){return p.id==='jar-vent';});return !!(part&&c.builder.getParts().find(function(p){return p.id===part.buildId;})?.open);}
    function exchange(g,targetVolume,tau,dt){var next=(g.amount+dt*targetVolume/tau)/(1+dt/tau),change=next-g.amount;if(change>0)g.admitted+=change;else g.expired-=change;g.amount=next;}
    function piston(){var p=s.piston;return rect(p.x,p.y+s.offset,p.width,p.height);}
    function gasVolume(){var p=piston(),a=L.liquid.arrays,n=L.liquid.getCount();waterArea=0;
      for(var i=0;i<n;i++)if(a.x[i]>jar.x+8&&a.x[i]<jar.x+jar.width-8&&a.y[i]>jar.y+8&&a.y[i]<p.y)waterArea+=1.5625;
      return (jar.width-16)*(p.y-jar.y-8)-models.reduce(function(total,m){return total+m.volume;},0)-waterArea;
    }
    function targetArea(m){var a=inner(m.body),v=area(c.skinRing(m.body));if(v>0)m.body.restArea=a*m.target/v;m.body.sleeping=false;m.body.sleepFrames=0;}
    function update(dt){
      if(!(dt>0)||retired)return;time+=dt;
      models.forEach(function(m){m.volume=area(c.skinRing(m.body));});
      if(!fish){var previous=s.offset,target=s.motor?s.stroke:0;s.offset=Math.max(previous-s.speed*dt,Math.min(previous+s.speed*dt,target));
        var v=gasVolume();if(!(v>0)){error='The gas chamber has no free volume.';return;}
        if(!chamber.initial)chamber.initial=chamber.amount=v;
        if(ventOpen())exchange(chamber,v,.025,dt);
        chamber.volume=v;chamber.pressure=chamber.amount/v;chamber.work-=((chamber.pressure+lastPressure)*.5-1)*(s.offset-previous)*(jar.width-16);lastPressure=chamber.pressure;
      }
      models.forEach(function(m){
        var b=m.body,surface=fish?b.cartesianDiver.surfaceY:null;
        m.outside=fish?1+250*Math.max(0,surface===null?0:b.cy-surface)/c.airModel.settings.atmospherePressure:chamber.pressure;
        if(!s.blocked&&(s.kind==='lungs'||fish)){
          // Airway resistance uses current internal pressure. Backward Euler
          // preserves a positive finite inventory even for a large frame.
          var supply=fish?(s.pumped?1.07:1):1;
          exchange(m,supply*m.volume,s.airwayTime*m.volume/m.initial,dt);
        }
        m.pressure=m.amount/m.volume;
        var k=s.elasticity/m.initial,beta=m.outside-s.elasticity;
        m.target=2*m.amount/(beta+Math.sqrt(beta*beta+4*k*m.amount));
        if(!Number.isFinite(m.target)||!(m.target>0)){error='Gas-body volume is not finite.';return;}
        b.gasBodyRenderArea=m.volume;targetArea(m);
      });
      d.readingLabel=fish?'Bladder '+Math.round(100*models[0].volume/models[0].initial)+'%':('Jar '+(14.7*(chamber.pressure-1)).toFixed(2)+' psi; '+(s.kind==='lungs'?'lungs ':'slime ')+Math.round(100*models[0].volume/models[0].initial)+'%');
      d.gasBodyReading={seconds:time,stroke:s.offset,motor:s.motor,pumped:s.pumped,vented:fish?false:ventOpen(),blocked:s.blocked,waterArea:waterArea,error:error,
        chamber:fish?null:Object.assign({},chamber,{residual:chamber.amount-chamber.initial-chamber.admitted+chamber.expired}),
        bodies:models.map(function(m){return{x:m.body.cx,y:m.body.cy,initial:m.initial,volume:m.volume,target:m.target,amount:m.amount,admitted:m.admitted,expired:m.expired,residual:m.amount-m.initial-m.admitted+m.expired,inside:m.pressure,outside:m.outside,ballast:fish?m.body.cartesianDiver.mass:null};})};
    }
    var lastPressure=1;update(1e-6);
    return{smoke:false,clock:function(){return time;},tick:function(dt){var now=L.simulationClock,h=fish?Math.max(0,now-clock):dt;clock=now;update(h);},
      primary:function(){if(fish){s.pumped=!s.pumped;d.action=s.pumped?'Vent bladder':'Fill bladder';}else{s.motor=!s.motor;d.action=s.motor?'Raise diaphragm':'Lower diaphragm';}return true;},
      project:function(b){if(fish)return;var m=models.find(function(m){return m.body===b;});if(!m)return;var x=0,y=0,ox=0,oy=0;
        for(var i=0;i<b.n;i++){x+=b.px[i]/b.n;y+=b.py[i]/b.n;ox+=b.ox[i]/b.n;oy+=b.oy[i]/b.n;}
        for(i=0;i<b.n;i++){b.px[i]+=m.cx-x;b.py[i]+=m.cy-y;b.ox[i]+=m.cx-ox;b.oy[i]+=m.cy-oy;}
        b.cx=m.cx;b.cy=m.cy;b.bboxL=b.bboxT=Infinity;b.bboxR=b.bboxB=-Infinity;
        for(i=0;i<b.n;i++){b.bboxL=Math.min(b.bboxL,b.px[i]);b.bboxR=Math.max(b.bboxR,b.px[i]);b.bboxT=Math.min(b.bboxT,b.py[i]);b.bboxB=Math.max(b.bboxB,b.py[i]);}if(b.surfaceSlime)b.surfaceSlime.fluidFrame=-1;
      },
      guest:fish?null:function(){var p=piston(),vy=s.motor&&s.offset<s.stroke?s.speed:!s.motor&&s.offset>0?-s.speed:0;vy/=L.getSimParam('TIMESCALE');return{x:p.x+p.width*.5,y:p.y+p.height*.5,hw:p.width*.5+.01,hh:p.height*.5+.01,mvx:0,mvy:vy,pts:[p.x,p.y,0,vy,p.x+p.width,p.y,0,vy,p.x+p.width,p.y+p.height,0,vy,p.x,p.y+p.height,0,vy]};},
      stats:function(){return d.gasBodyReading;},draw:function(ctx){if(fish)return;var p=piston();ctx.save();ctx.lineWidth=1.5;ctx.globalAlpha=.6;ctx.strokeRect(p.x,p.y,p.width,p.height);ctx.beginPath();ctx.moveTo(p.x+p.width*.5,p.y+p.height);ctx.lineTo(p.x+p.width*.5,384);ctx.stroke();ctx.font='11px Commit Mono, monospace';ctx.textAlign='center';ctx.fillText('Motor-driven diaphragm',360,396);
        if(s.kind==='lungs')models.forEach(function(m){var ring=c.skinRing(m.body),top=ring.reduce(function(y,q){return Math.min(y,q.y);},Infinity);ctx.beginPath();ctx.moveTo(m.cx-4,72);ctx.lineTo(m.body.cx-4,top);ctx.moveTo(m.cx+4,72);ctx.lineTo(m.body.cx+4,top);ctx.stroke();ctx.fillText(s.blocked?'Blocked tube':'Room air',m.cx,64);});ctx.restore();},
      destroy:function(){retired=true;c.bodies.forEach(function(b){delete b.gasBodySkin;delete b.gasBodyRenderArea;});}
    };
  }
  root.WSSGasBodyLabs={make:make};root.WSSDraftRuntime={create:create};
  root.WSSMachines=root.WSSMachines||{};
  ['bell-jar-lungs','vacuum-slime','swim-bladder-fish'].forEach(function(id){root.WSSMachines[id]={make:function(w,o){return make(id,w,o);}};});
})(typeof window!=='undefined'?window:globalThis);
