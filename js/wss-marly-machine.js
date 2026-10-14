/* A river-loaded wheel geared to the established native-water piston pump. */
(function(root){
'use strict';root.WSSMachines=root.WSSMachines||{};
var CX=144,CY=270,R=44,GEAR=8,INERTIA=6000000;
function make(world,options){
  options=options||{};
  var factory=root.WSSMachines['spray-bottle'];if(!factory)throw Error('The native spray pump must load before Marly.');
  var d=factory.make(world,options),enabled=options.river!==false;
  d.vessels.find(function(v){return v.id==='supply';}).label='River source';
  d.vessels.find(function(v){return v.id==='pump';}).label='Piston pump';
  d.vessels.find(function(v){return v.id==='catcher';}).label='Upper receiver';
  d.name='marly-machine';d.title='Machine de Marly';d.marlyNative={river:enabled};
  d.setup=enabled?'river':'still';d.setups=[{id:'river',label:'River flowing',options:{}},{id:'still',label:'Still river',options:{river:false}}];
  d.setupNote='Both comparisons use the same finite source and primed piston. Only the river current changes.';
  d.primary={kind:'tap'};d.action=enabled?'Stop river':'Start river';
  d.caption='The river current loads the wheel. Gearing works the piston, and two check valves carry native water up into the receiver.';
  d.readingLabel=enabled?'River loading wheel':'Still river';
  d.initial[0]={kind:'rect',rect:{x:80,y:264,width:120,height:112}};
  var upper={x:536,y:192,width:128,height:160};d.pipes[1].points[2].y=208;d.pipes[1].points[3].y=208;d.vessels.find(function(v){return v.id==='catcher';}).rect=upper;d.measure.receiver=upper;
  d.marks=[];d.divers.squeezed=false;d.divers.stroke=64;d.divers.speed=0;d.divers.pistonLabel='Geared piston';
  d.boundaries={pool:true,reserveCapacity:24000,tap:{x:88,y:216,width:8,height:4,rate:900,vx:500,vy:0,enabled:enabled},drain:{x:192,y:240,width:8,height:8},caps:[],reservoirY:376};
  d.boundaryNote='The piston pump is the tested native-water apparatus. Its pressure-operated check valves, primed cylinder, lift line and receiver move actual resident MLS-MPM particles. A declared river boundary injects native particles with horizontal momentum. Measured native water velocity upstream of the paddles supplies a quadratic momentum-flux load. Eight wheel revolutions turn the pump crank once; the crank position constrains the piston boundary. No drawn water, transfer ledger, assigned tank level or target wheel speed exists.';
  d.energyBudgetStatus='Two-dimensional numerical contact and measured native-water momentum flux approximate the paddle load. Exact reciprocal impact impulses are not available at the shaft. The piston uses the same moving native-water boundary and check valves as the native spray pump. Gearing trades shaft speed for torque. Fluid impact momentum is not exactly returned to the shaft, and the powered river boundary supplies external mass and energy. This is one working stage, not the historic 14-wheel installation.';
  return d;
}
var previous=root.WSSDraftRuntime;
function create(c){
  var d=c.definition;if(!d.marlyNative)return previous&&previous.create?previous.create(c):null;
  var L=c.liquid,air=c.airModel,boundary=c.nativeBoundary,I=root.WaterMachinesInstruments;
  if(!c.divers||!air||!air.enabled||!boundary)throw Error('Marly requires the native pitcher pump, pressure field and river source.');
  var angle=0,travel=0,omega=0,clock=L.simulationClock,river=d.marlyNative.river,brake=false,pressure=0,
    wheelTorque=0,pumpTorque=0,sampleClock=-Infinity,pressureClock=-Infinity,pending=false,retired=false,error=null,receiver=0,source=0,peakReceiver=0;
  var panel=document.createElement('div');panel.className='marly-native-panel';
  panel.innerHTML='<strong>Machine de Marly</strong><p>River turns wheel. The geared piston pushes real water uphill.</p><span id="marly-wheel">Wheel 0.0 rpm</span><span id="marly-water">Receiver 0 parcels</span><span id="marly-pressure">Pump 0.0 kPa</span><button type="button" id="marly-brake" aria-pressed="false">Apply brake</button><span id="marly-state">River loading the wheel</span>';
  document.getElementById('toy-viewport').appendChild(panel);
  var button=panel.querySelector('#marly-brake');button.addEventListener('click',function(){brake=!brake;button.setAttribute('aria-pressed',String(brake));button.textContent=brake?'Release brake':'Apply brake';});
  function blades(){
    var scale=L.getSimParam('TIMESCALE')||1,out=[];
    for(var k=0;k<4;k++){
      var a=angle+k*Math.PI/2,co=Math.cos(a),si=Math.sin(a),corners=[[20,-4],[R,-4],[R,4],[20,4]],pts=[],x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity,vx=0,vy=0;
      corners.forEach(function(q){var dx=q[0]*co-q[1]*si,dy=q[0]*si+q[1]*co,x=CX+dx,y=CY+dy;pts.push(x,y,-omega*dy/scale,omega*dx/scale);vx+=-omega*dy/scale;vy+=omega*dx/scale;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);});
      out.push({x:(x0+x1)/2,y:(y0+y1)/2,hw:(x1-x0)/2+.01,hh:(y1-y0)/2+.01,mvx:vx/4,mvy:vy/4,pts:pts});
    }
    return out;
  }
  function guests(){return blades().concat([c.divers.guest()]);}
  function countWater(){
    var p=c.sampleParticles();if(p.time===sampleClock)return;sampleClock=p.time;receiver=source=0;var flux=0,fluxY=0;
    var a=d.measure.source,b=d.measure.receiver;
    for(var i=0;i<p.count;i++){var x=p.x[i],y=p.y[i];if(x>a.x+8&&x<a.x+a.width-8&&y>a.y&&y<a.y+a.height-8)source++;if(x>b.x+8&&x<b.x+b.width-8&&y>b.y&&y<b.y+b.height-8)receiver++;
      if(x>96&&x<120&&y>208&&y<248&&Number.isFinite(p.vx[i])){var q=p.vx[i]*Math.abs(p.vx[i]);flux+=q;fluxY+=q*y;}}
    peakReceiver=Math.max(peakReceiver,receiver);
    var contact=0;for(var k=0;k<4;k++){var a=angle+k*Math.PI/2;if(Math.sin(a)<0)contact=Math.max(contact,Math.sin(a)*Math.sin(a));}
    var lever=flux?Math.max(8,Math.min(48,CY-fluxY/flux)):32;
    wheelTorque=1.5625*flux/24*lever*contact*.65;
  }
  function samplePressure(){
    if(retired||pending||L.simulationClock-pressureClock<.10)return;pending=true;
    air.capture().then(function(s){if(retired||!s)return;
      var chamber=I.cell(s,352,304);if(chamber&&chamber.kind===1&&Number.isFinite(chamber.pressure))pressure=chamber.pressure;
      pressureClock=L.simulationClock;
    }).catch(function(e){error=e.message;}).finally(function(){pending=false;});
  }
  function reading(){
    var data={nativeWater:true,angle:angle,omega:omega,rpm:omega*60/(2*Math.PI),wheelTurns:angle/(2*Math.PI),wheelTravel:travel,pumpStroke:c.divers.stats().stroke,
      receiver:receiver,source:source,peakReceiver:peakReceiver,river:river,brake:brake,wheelTorque:wheelTorque,pumpTorque:pumpTorque,pressure:pressure,error:error,clock:L.simulationClock};
    d.marlyReading=data;d.readingLabel=error?'Pressure sample failed':brake?'Wheel braked':!river?'Still river':receiver>0?'Water reached the receiver':Math.abs(omega)>.05?'Wheel driving the pump':'River loading the wheel';
    panel.querySelector('#marly-wheel').textContent='Wheel '+data.rpm.toFixed(1)+' rpm';panel.querySelector('#marly-water').textContent='Receiver '+receiver+' parcels';panel.querySelector('#marly-pressure').textContent='Pump '+(pressure/1000).toFixed(1)+' kPa';panel.querySelector('#marly-state').textContent=d.readingLabel;
  }
  function tick(){
    var now=L.simulationClock,dt=Math.max(0,Math.min(.05,now-clock));clock=now;river=boundary.stats().tapEnabled;d.action=river?'Stop river':'Start river';
    countWater();samplePressure();
    if(dt){
      var pumpAngle=angle/GEAR,derivative=d.divers.stroke*Math.sin(pumpAngle)/(2*GEAR);
      pumpTorque=pressure*d.divers.piston.width*derivative;
      var damping=180000*omega;
      var next=brake?0:omega+(wheelTorque-pumpTorque-damping)/INERTIA*dt;
      omega=Math.max(-2,Math.min(2,next));angle+=omega*dt;travel+=Math.abs(omega*dt);
      var target=d.divers.stroke*(1-Math.cos(angle/GEAR))*.5,current=c.divers.stats().stroke,delta=target-current;
      if(Math.abs(delta)>.02){if(c.divers.stats().squeezed!==(delta>0))c.divers.toggle();d.divers.speed=Math.min(100,Math.abs(delta)/dt);}else d.divers.speed=0;
    }
    reading();
  }
  function draw(ctx){
    var cs=getComputedStyle(document.documentElement),edge=cs.getPropertyValue('--accent').trim(),ink=cs.getPropertyValue('--text').trim();
    ctx.save();ctx.strokeStyle=edge;ctx.fillStyle=edge;ctx.lineWidth=3;ctx.beginPath();ctx.arc(CX,CY,R,0,Math.PI*2);ctx.stroke();
    blades().forEach(function(g){ctx.beginPath();for(var i=0;i<g.pts.length;i+=4){if(i)ctx.lineTo(g.pts[i],g.pts[i+1]);else ctx.moveTo(g.pts[i],g.pts[i+1]);}ctx.closePath();ctx.fill();ctx.stroke();});
    ctx.beginPath();ctx.arc(CX,CY,6,0,Math.PI*2);ctx.fill();ctx.fillStyle=ink;ctx.font='12px "Commit Mono", monospace';ctx.fillText('RIVER WHEEL',100,190);ctx.fillText('8:1 GEARS TO PISTON',254,162);ctx.fillText('UPPER RECEIVER',522,122);ctx.restore();
  }
  reading();return{guests:guests,tick:tick,draw:draw,stats:function(){return d.marlyReading;},destroy:function(){retired=true;panel.remove();}};
}
root.WSSMarlyMachine={make:make};root.WSSMachines['marly-machine']={make:make};root.WSSDraftRuntime={create:create};
})(typeof window!=='undefined'?window:globalThis);
