/* Reduced workshop apparatus: finite liquid inventories, pressure-driven ports and mechanical loads. */
(function(root){
'use strict';
var RHO=1000,G=9.80665,ATM=101325,RG=287.05,RV=461.5,CP=4184,LATENT=2257000;
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function sat(T){return 133.322*Math.pow(10,8.07131-1730.63/(233.426+clamp(T-273.15,0,105)));}
function orifice(dp,area,rho){return .62*area*Math.sign(dp)*Math.sqrt(2*Math.abs(dp)/(rho||RHO));}
function node(id,label,x,y,w,h,liters,capacity,bottom,area){return {id:id,label:label,x:x,y:y,w:w,h:h,v:liters/1000,capacity:capacity/1000,bottom:bottom||0,area:area||capacity/1000/.5};}
function transfer(a,b,wanted){var v=clamp(wanted,-Math.min(b.v,a.capacity-a.v),Math.min(a.v,b.capacity-b.v));a.v-=v;b.v+=v;return v;}
function head(a){return a.bottom+a.v/a.area;}
function base(id){return {id:id,t:0,nodes:[],links:[],admitted:0,escaped:0,workJ:0,heatInJ:0,heatOutJ:0,controls:[],notice:'',model:'Reduced finite-volume apparatus',finite:true,ready:true};}
function link(s,a,b,q,label){s.links.push({a:a,b:b,q:q,label:label||''});}
function total(s){return s.nodes.reduce(function(sum,n){return sum+n.v;},0)+(s.vaporMass||0)/RHO;}
function action(s,id,held){var c=s.controls.find(function(c){return c.id===id;});if(c && c.run)c.run(held);}
function control(s,id,label,run,held){s.controls.push({id:id,label:label,run:run,held:!!held});}
function finalize(s,step){if(!s.links.length){var routes=s.id==='water-half-adder'?[[0,2],[1,2],[2,3]]:s.nodes.length===2?[[0,1]]:[[0,1],[1,2]];if(['singing-birds-owl','water-organ','hydraulophone'].indexOf(s.id)>=0)routes.push([2,0]);routes.forEach(function(route){link(s,s.nodes[route[0]],s.nodes[route[1]],0);});}s.initial=total(s);s.step=function(dt){if(!Number.isFinite(dt)||dt<0)throw Error('Invalid workshop step');var remain=dt;while(remain>1e-10){var h=Math.min(remain,.0025);s.links=[];step(h);s.t+=h;remain-=h;}s.massError=total(s)-s.initial-s.admitted+s.escaped;s.finite=s.nodes.every(function(n){return Number.isFinite(n.v)&&n.v>=-1e-12&&n.v<=n.capacity+1e-12;})&&Number.isFinite(s.massError);if(!s.finite)throw Error('Non-finite workshop state');};s.activate=function(id,held){action(s,id,held);};s.release=function(){s.controls.forEach(function(c){if(c.held)c.run(false);});};return s;}
function thermal(id,o){
 var s=base(id),geyser=id==='steam-geyser',doors=id==='hero-temple-doors';
 var lower=node('flask',geyser?'Hot chamber':'Lower flask',152,190,152,158,.52,.86,0,.0014),upper=node('upper',doors?'Door counterweight':geyser?'Cool recharge bowl':'Coffee bowl',432,86,152,152,geyser?.28:0,.9,.2,.0045);
 s.nodes=[lower,upper];s.T=geyser?365:343.15;s.vaporMass=sat(s.T)*(lower.capacity-lower.v)/(RV*s.T);lower.v-=s.vaporMass/RHO;
 var gasV=lower.capacity-lower.v;s.airMass=(ATM-sat(s.T))*gasV/(RG*s.T);s.upperT=293.15;s.heater=o.heated!==false;s.power=geyser?1900:1250;s.cooling=geyser?1.7:3.8;s.q=0;s.cycles=0;s.angle=0;s.angularVelocity=0;s.maxAngle=0;s.peakUpper=upper.v;s.peakPressure=ATM;s.lastOut=false;s.flows={};
 control(s,'heater',function(){return s.heater?'Turn heater off':'Turn heater on';},function(held){if(held)s.heater=!s.heater;});
 if(geyser)control(s,'cooling','Add cold recharge',function(held){if(held){var energy=Math.min(30000,Math.max(0,(s.T-293.15)*(RHO*lower.v*CP+160)));s.T-=energy/(RHO*lower.v*CP+160);s.heatOutJ+=energy;}});
 return finalize(s,function(dt){
  var capacity=RHO*lower.v*CP+160,heat=(s.heater&&lower.v>.000015?s.power:0)*dt,loss=s.cooling*(s.T-293.15)*dt;
  s.heatInJ+=heat;s.heatOutJ+=loss;s.T+= (heat-loss)/capacity;
  var upperCapacity=RHO*upper.v*CP+80,upperLoss=(geyser?55:12)*(s.upperT-293.15)*dt;s.upperT-=upperLoss/upperCapacity;s.heatOutJ+=upperLoss;
  var target=sat(s.T)*Math.max(.000025,lower.capacity-lower.v)/(RV*s.T),dm=clamp((target-s.vaporMass)*dt*4,-s.vaporMass,lower.v*RHO*.15);
  // Latent heat is paid by the finite water and flask heat capacity.
  dm=clamp(dm,-Infinity,Math.max(0,(s.T-273.15)*capacity/LATENT));s.vaporMass+=dm;lower.v-=dm/RHO;s.T-=dm*LATENT/capacity;
  gasV=Math.max(.000025,lower.capacity-lower.v);s.pressure=(s.airMass*RG+s.vaporMass*RV)*s.T/gasV;s.peakPressure=Math.max(s.peakPressure,s.pressure);
  var rise=geyser?.44:doors?.34:.22,dp=s.pressure-ATM+RHO*G*(head(lower)-head(upper)-rise);
  // A bidirectional liquid tube carries momentum; its hydraulic drag dissipates it.
  var area=geyser?.000038:.000016,inertia=RHO*(geyser?.75:.6)/area,resistance=RHO/(2*.62*.62*area*area);
  s.q+=(dp-resistance*s.q*Math.abs(s.q))*dt/inertia;s.q=clamp(s.q,-.0003,.0003);
  var v=transfer(lower,upper,s.q*dt);s.q=v/dt;
  if(v>0){var addedHeat=RHO*v*CP;s.upperT=(s.upperT*upperCapacity+s.T*addedHeat)/(upperCapacity+addedHeat);}
  if(v<0){var mixed=RHO*(-v)*CP;s.T=(s.T*capacity+s.upperT*mixed)/(capacity+mixed);}
  // Exposing the dip-tube mouth vents the real finite gas charge. This blowdown,
  // rather than an eruption timer, allows cold recharge and repeated geysers.
  if(lower.v<.000026 && s.pressure>ATM){var gasMass=s.airMass+s.vaporMass,rho=gasMass/gasV,escape=Math.min(gasMass*.15,Math.max(0,orifice(s.pressure-ATM,geyser?.000035:.000004,rho))*rho*dt),fraction=escape/Math.max(1e-12,gasMass),steamEscape=s.vaporMass*fraction;s.airMass*=1-fraction;s.vaporMass-=steamEscape;s.escaped+=steamEscape/RHO;s.heatOutJ+=steamEscape*(LATENT+CP*(s.T-293.15));}
  if(geyser){
   // Expelled hot water cools in the open bowl. A check-valved gravity feed opens
   // when reservoir pressure drops below the recharge head.
   var feed=orifice(RHO*G*(.38+head(upper)-head(lower))-(s.pressure-ATM),.000025);feed=Math.max(0,feed);
   var fed=transfer(upper,lower,feed*dt),mix=RHO*fed*CP;s.T=(s.T*capacity+s.upperT*mix)/(capacity+mix);s.flows.refill=fed/dt;
   var erupt=s.q>.00003;if(erupt&&!s.lastOut)s.cycles++;s.lastOut=erupt;
  }
  if(doors){var bucketMass=upper.v*RHO,torque=bucketMass*G*.16-.12-s.angle*.032,acc=(torque-.15*s.angularVelocity)/.045;s.angularVelocity+=acc*dt;s.angle=clamp(s.angle+s.angularVelocity*dt,0,1.45);if(s.angle===0&&s.angularVelocity<0||s.angle===1.45&&s.angularVelocity>0)s.angularVelocity=0;s.maxAngle=Math.max(s.maxAngle,s.angle);}
  s.peakUpper=Math.max(s.peakUpper,upper.v);s.flows.tube=s.q;link(s,lower,upper,s.q,'Pressure tube');s.notice=(s.T-273.15).toFixed(1)+' C   '+((s.pressure-ATM)/1000).toFixed(1)+' kPa   '+(Math.abs(s.q)*1e6).toFixed(0)+' mL/s';
 });
}
function halfAdder(o){
 var s=base('water-half-adder'),a=node('a','Input A',56,84,118,144,.9,1,1.1,.002),b=node('b','Input B',546,84,118,144,.9,1,1.1,.002),gate=node('gate','Float chamber',288,102,128,132,clamp(Number.isFinite(o.gateMl)?o.gateMl:6,0,12)/1000,.15,.3,.0003),sum=node('sum','SUM',150,264,160,80,0,1.1,0,.004),carry=node('carry','CARRY',424,264,160,80,0,1.1,0,.004);s.nodes=[a,b,gate,sum,carry];s.inputs=[o.a!==false,o.b===true];s.carryOpen=false;s.outputs=[0,0];s.flows={};
 ['A','B'].forEach(function(n,i){control(s,'input-'+n,function(){return n+': '+(s.inputs[i]?'open':'closed');},function(held){if(held)s.inputs[i]=!s.inputs[i];});});
 return finalize(s,function(dt){var h=gate.v/gate.area;if(h>.23)s.carryOpen=true;else if(h<.18)s.carryOpen=false;
  var qa=s.inputs[0]?Math.max(0,orifice(RHO*G*(head(a)-head(gate)),.000010)):0,qb=s.inputs[1]?Math.max(0,orifice(RHO*G*(head(b)-head(gate)),.000010)):0;
  qa=transfer(a,gate,qa*dt)/dt;qb=transfer(b,gate,qb*dt)/dt;
  var out=s.carryOpen?carry:sum,area=s.carryOpen?.000025:.000027,qo=Math.max(0,orifice(RHO*G*h,area));qo=transfer(gate,out,qo*dt)/dt;
  s.outputs=s.carryOpen?[0,qo]:[qo,0];s.flows={a:qa,b:qb,sum:s.outputs[0],carry:s.outputs[1]};s.gateHeight=h;
  link(s,a,gate,qa);link(s,b,gate,qb);link(s,gate,out,qo);s.notice='A '+(qa*1e6).toFixed(0)+' + B '+(qb*1e6).toFixed(0)+' mL/s    '+(s.carryOpen?'Carry gate open':'Sum gate open');
 });
}
function heart(o){
 o=o||{};var s=base('slime-heart'),source=node('source','Venous reservoir',64,128,152,232,clamp(Number.isFinite(o.sourceL)?o.sourceL:.75,.65,.85),1,.12,.003),heart=node('heart','Elastic heart',280,194,152,150,.08,.16,.1,.002),air=node('air','Air accumulator',504,94,144,266,.005,.45,.35,.002);s.nodes=[source,heart,air];s.squeeze=false;s.x=0;s.vx=0;s.pressure=0;s.pumped=0;s.inletTotal=0;s.strokeWorkJ=0;s.flows={};
 control(s,'squeeze','Hold to squeeze',function(held){s.squeeze=held;},true);
 return finalize(s,function(dt){var p=(heart.v-(.00008-.002*s.x))/3e-9;s.pressure=p;var force=(s.squeeze?48:0)-500*s.x-18*s.vx-.002*p;s.vx+=force/.4*dt;var x=clamp(s.x+s.vx*dt,0,.028);if(x===0&&s.vx<0||x===.028&&s.vx>0)s.vx=0;s.strokeWorkJ+=s.squeeze?48*(x-s.x):0;s.x=x;
  var inlet=Math.max(0,orifice(RHO*G*(head(source)-.1)-p,.000014)),outlet=Math.max(0,orifice(p-RHO*G*(head(air)-.1)-((ATM*.00044/Math.max(.00004,air.capacity-air.v))-ATM),.000014));
  inlet=transfer(source,heart,inlet*dt)/dt;outlet=transfer(heart,air,outlet*dt)/dt;s.pumped+=outlet*dt;s.inletTotal+=inlet*dt;s.flows={inlet:inlet,outlet:outlet};link(s,source,heart,inlet,'Inlet check valve');link(s,heart,air,outlet,'Outlet check valve');s.notice=(p/1000).toFixed(1)+' kPa   '+(s.pumped*1e6).toFixed(0)+' mL pumped';
 });
}
function toilet(o){
 var s=base('glass-toilet'),tank=node('tank','Cistern',88,66,192,154,o.half?3:6,6.2,.6,.02),bowl=node('bowl','Bowl and water seal',336,194,176,128,1.2,4,.08,.015),sewer=node('sewer','Collector',552,280,132,96,0,30,-.3,.1);s.nodes=[tank,bowl,sewer];s.flap=0;s.flapV=0;s.siphon=false;s.priming=0;s.flushes=0;s.siphons=0;s.minBowl=bowl.v;s.feed=o.supply!==false;s.supplyTotal=0;s.trapVolume=.00018;s.flows={};
 control(s,'flush','Flush',function(held){if(held&&tank.v>.0003){s.flap=.8;s.flapV=0;s.flushes++;}});
 control(s,'supply',function(){return s.feed?'Stop refill':'Start refill';},function(held){if(held)s.feed=!s.feed;});
 return finalize(s,function(dt){
  // A hollow buoyant flapper stays raised while submerged, then falls onto its seat.
  var depth=tank.v/tank.area,buoyancy=depth>.025?.008:0,torque=s.flap>.01?(buoyancy-.003)*G*.03:0;s.flapV+=(torque-.008*s.flapV-.0005*s.flap)*dt/.0005;s.flap=clamp(s.flap+s.flapV*dt,0,1.25);if(s.flap<.025&&s.flapV<=0){s.flap=0;s.flapV=0;}if(s.flap===1.25)s.flapV=0;
  var q=orifice(RHO*G*Math.max(0,head(tank)-head(bowl)),.0008*Math.sin(s.flap));q=transfer(tank,bowl,q*dt)/dt;
  var h=bowl.v/bowl.area,over=Math.max(0,orifice(RHO*G*(h-.08),.00008)),out=0;
  // Water above the crest displaces the finite trap air; admission is volumetric.
  if(!s.siphon){var prime=Math.max(0,orifice(RHO*G*(h-.12),.00035));s.priming=clamp(s.priming+(prime-over*.4)*dt,0,s.trapVolume);if(s.priming>=s.trapVolume-1e-10){s.siphon=true;s.siphons++;}}
  if(s.siphon){out=Math.max(0,orifice(RHO*G*(h+.26),.0006));if(h<.025){s.siphon=false;s.priming=0;}}
  else out=over;out=transfer(bowl,sewer,out*dt)/dt;
  var feed=s.feed?.00028*clamp((.006-tank.v)/.0005,0,1):0;if(feed>0){var dv=Math.min(feed*dt,(tank.capacity-tank.v)/.87);tank.v+=dv*.87;bowl.v+=dv*.13;s.admitted+=dv;s.supplyTotal+=dv;}
  s.minBowl=Math.min(s.minBowl,bowl.v);s.flows={flush:q,outlet:out,refill:feed};link(s,tank,bowl,q,'Flush');link(s,bowl,sewer,out,s.siphon?'Siphon':'Trap overflow');s.notice=(s.siphon?'Siphon running':s.flap>.1?'Cistern flushing':feed>0?'Refilling':'Ready')+'   '+(q*1000).toFixed(2)+' L/s';
 });
}
function instrument(id,o){
 var s=base(id),birds=id==='singing-birds-owl',hydro=id==='hydraulophone',supply=node('supply','Gravity supply',64,112,144,160,.9,1.1,.72,.003),chamber=node('chamber','Air chest',276,210,168,154,.04,.42,.12,.002),basin=node('basin','Return basin',492,280,164,84,.08,1.2,0,.004);s.nodes=[supply,chamber,basin];s.airMass=ATM*(chamber.capacity-chamber.v)/(RG*293.15);s.pump=o.pump!==false;s.draining=false;s.cycles=0;s.angle=0;s.angularVelocity=0;s.sound=false;s.keys=birds?[true,true,true,false]:[true,false,false,false];s.lengths=hydro?[.19,.17,.15,.127]:[.24,.202,.18,.16];s.voices=[];s.flows={};s.pumpWorkJ=0;s.airInitial=s.airMass;s.airAdmitted=0;s.airEscaped=0;s.airPumpWorkJ=0;
 control(s,'sound',function(){return s.sound?'Mute sound':'Turn on sound';},function(held){if(held)s.sound=!s.sound;});
 control(s,'pump',function(){return s.pump?(birds?'Stop return pump':'Stop bellows pump'):(birds?'Start return pump':'Start bellows pump');},function(held){if(held)s.pump=!s.pump;});
 if(!birds)s.keys.forEach(function(_,i){control(s,'key-'+i,function(){return (hydro?'Hole ':'Pipe ')+(i+1)+(s.keys[i]?' sounding':' closed');},function(held){if(held)s.keys[i]=!s.keys[i];});});
 return finalize(s,function(dt){var volume=Math.max(.000015,chamber.capacity-chamber.v),p=s.airMass*RG*293.15/volume;s.pressure=p;var q=birds&&s.draining?0:Math.max(0,orifice(RHO*G*(head(supply)-head(chamber))-(p-ATM),.000025))*(birds?1:clamp((.00035-chamber.v)/.00008,0,1));q=transfer(supply,chamber,q*dt)/dt;
  if(birds&&chamber.v>.00030)s.draining=true;if(birds&&s.draining&&chamber.v<.00007){s.draining=false;s.cycles++;}
  var drain=birds?(s.draining?Math.max(0,orifice(p-ATM+RHO*G*(head(chamber)-head(basin)),.00013)):0):Math.max(0,orifice(RHO*G*(head(chamber)-head(basin)),.000008));drain=transfer(chamber,basin,drain*dt)/dt;
  var pumped=s.pump?transfer(basin,supply,.000045*dt):0;s.pumpWorkJ+=pumped*RHO*G*Math.max(0,head(supply)-head(basin));s.workJ=s.pumpWorkJ;
  var rho=Math.max(.1,s.airMass/volume);s.voices=[];var gas=0;s.keys.forEach(function(key,i){var active=birds?!s.draining&&i<3:key,area=active?(hydro?.0000007:.0000011):.00000002,flow=orifice(p-ATM,area,rho);gas+=flow;
   s.voices.push({frequency:343/(4*(s.lengths[i]+.003)),flow:Math.max(0,flow),power:Math.max(0,(p-ATM)*flow),active:active,length:s.lengths[i]});});
  if(birds&&s.draining)gas+=orifice(p-ATM,.00002,rho);
  var sourceAir=!birds&&s.pump?Math.max(0,orifice(6000-(p-ATM),.000001,ATM/(RG*293.15))):0,addedAir=sourceAir*dt*ATM/(RG*293.15);s.airMass+=addedAir;s.airAdmitted+=addedAir;s.airPumpWorkJ+=addedAir/(ATM/(RG*293.15))*6000;s.workJ=s.pumpWorkJ+s.airPumpWorkJ;
  var massDelta=gas*dt*(gas>0?rho:ATM/(RG*293.15));massDelta=Math.min(s.airMass*.1,massDelta);s.airMass-=massDelta;if(massDelta>0)s.airEscaped+=massDelta;else s.airAdmitted-=massDelta;s.airError=s.airMass+s.airEscaped-s.airAdmitted-s.airInitial;
  if(birds){var targetTorque=(s.draining?.035:-.025)-.027*s.angle;s.angularVelocity+=(targetTorque-.023*s.angularVelocity)/.01*dt;s.angle=clamp(s.angle+s.angularVelocity*dt,0,1.3);if(s.angle===0&&s.angularVelocity<0||s.angle===1.3&&s.angularVelocity>0)s.angularVelocity=0;}
  s.flows={fill:q,drain:drain,pump:pumped/dt,air:gas,airSupply:sourceAir};link(s,supply,chamber,q,'Water feed');link(s,chamber,basin,drain,'Drain');link(s,basin,supply,pumped/dt,'Powered return');s.notice=((p-ATM)/1000).toFixed(2)+' kPa   '+(birds?'Fill/drain cycles '+s.cycles:s.voices.filter(function(v){return v.active;}).length+' open voices');
 });
}
function create(id,o){o=o||{};if(['vacuum-coffee','steam-geyser','hero-temple-doors'].indexOf(id)>=0)return thermal(id,o);if(id==='water-half-adder')return halfAdder(o);if(id==='slime-heart')return heart(o);if(id==='glass-toilet')return toilet(o);if(['singing-birds-owl','water-organ','hydraulophone'].indexOf(id)>=0)return instrument(id,o);throw Error('Unknown workshop model '+id);}
root.WSSWorkshopModels={create:create,orifice:orifice,saturation:sat};
})(typeof window!=='undefined'?window:globalThis);
