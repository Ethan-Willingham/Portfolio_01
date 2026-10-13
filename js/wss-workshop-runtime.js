/* Workshop controllers and meters. Rendered fill is the finite-volume state, never a timed fill animation. */
(function(root){
'use strict';
function color(token,fallback){if(typeof getComputedStyle==='undefined')return fallback;return getComputedStyle(document.documentElement).getPropertyValue(token).trim()||fallback;}
function cloneStats(s){var result={};Object.keys(s).forEach(function(k){if(typeof s[k]!=='function'&&k!=='controls')result[k]=s[k];});return JSON.parse(JSON.stringify(result));}
function createAudio(){var ctx=null,voices=[],active=true,enabled=false;return{set:function(on){enabled=on;if(on&&!ctx&&typeof window!=='undefined'){var C=window.AudioContext||window.webkitAudioContext;if(C)ctx=new C();}if(ctx){if(on&&active)ctx.resume().catch(function(){});else ctx.suspend().catch(function(){});}},active:function(on){active=on;this.set(enabled);},update:function(data){if(!ctx||!enabled||!active)return;data.forEach(function(v,i){if(!voices[i]){var osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';gain.gain.value=0;osc.connect(gain);gain.connect(ctx.destination);osc.start();voices[i]={osc:osc,gain:gain};}voices[i].osc.frequency.setTargetAtTime(Math.max(30,Math.min(12000,v.frequency)),ctx.currentTime,.025);voices[i].gain.gain.setTargetAtTime(Math.min(.018,Math.sqrt(Math.max(0,v.power||0))*.018),ctx.currentTime,.035);});voices.slice(data.length).forEach(function(v){v.gain.gain.setTargetAtTime(0,ctx.currentTime,.02);});},stats:function(){return{enabled:enabled,state:ctx?ctx.state:'closed',voices:voices.length};},destroy:function(){voices.forEach(function(v){v.osc.stop();v.osc.disconnect();v.gain.disconnect();});voices=[];if(ctx)ctx.close().catch(function(){});ctx=null;}};}
function drawToilet(c,s,text,accent,water,rule){
 var tank=s.nodes[0],bowl=s.nodes[1],collector=s.nodes[2],tankY=239-142*Math.min(1,tank.v/tank.capacity),bowlY=320-122*Math.min(1,bowl.v/bowl.capacity),drainY=373-95*Math.min(1,collector.v/collector.capacity);
 c.save();c.lineJoin='round';c.lineCap='round';c.lineWidth=3;c.strokeStyle=accent;
 c.beginPath();c.rect(72,90,188,150);c.moveTo(65,84);c.lineTo(267,84);c.stroke();
 c.save();c.beginPath();c.rect(74,92,184,146);c.clip();c.fillStyle=water;c.globalAlpha=.48;c.fillRect(74,tankY,184,239-tankY);c.restore();
 c.strokeStyle=rule;c.lineWidth=14;c.beginPath();c.moveTo(260,217);c.lineTo(301,217);c.lineTo(301,253);c.lineTo(343,253);c.stroke();
 if(s.flows.flush>1e-8){c.strokeStyle=water;c.lineWidth=Math.min(9,3+s.flows.flush*2000);c.stroke();}
 c.strokeStyle=accent;c.lineWidth=3;c.beginPath();c.moveTo(333,198);c.lineTo(515,198);c.moveTo(338,207);c.bezierCurveTo(344,263,355,306,411,320);c.bezierCurveTo(453,330,499,314,508,249);c.lineTo(514,207);c.stroke();
 c.save();c.beginPath();c.moveTo(338,207);c.bezierCurveTo(344,263,355,306,411,320);c.bezierCurveTo(453,330,499,314,508,249);c.lineTo(514,207);c.closePath();c.clip();c.fillStyle=water;c.globalAlpha=.48;c.fillRect(337,bowlY,180,322-bowlY);c.restore();
 c.strokeStyle=rule;c.lineWidth=16;c.beginPath();c.moveTo(500,288);c.lineTo(524,314);c.quadraticCurveTo(549,337,556,301);c.lineTo(556,269);c.quadraticCurveTo(558,258,571,269);c.lineTo(571,336);c.lineTo(608,336);c.stroke();
 if(s.flows.outlet>1e-8){c.strokeStyle=water;c.lineWidth=Math.min(10,3+s.flows.outlet*2500);c.stroke();}
 c.strokeStyle=accent;c.lineWidth=3;c.strokeRect(608,267,100,110);c.save();c.beginPath();c.rect(610,269,96,106);c.clip();c.fillStyle=water;c.globalAlpha=.48;c.fillRect(610,drainY,96,377-drainY);c.restore();
 c.fillStyle=text;c.textAlign='center';c.font='12px "Commit Mono", monospace';c.fillText('Cistern',166,72);c.fillText('Glass bowl',425,182);c.fillText('Siphon bend',550,251);c.fillText('Collector',658,251);
 c.font='11px "Commit Mono", monospace';c.fillText((tank.v*1000).toFixed(2)+' L',166,260);c.fillText((bowl.v*1000).toFixed(2)+' L',425,347);c.fillText((collector.v*1000).toFixed(2)+' L',658,395);
 c.fillText(s.notice,358,370);c.font='10px "Commit Mono", monospace';c.fillText('Finite-volume model. Water follows the cistern, bowl and drain inventories.',358,409);c.restore();
}
function drawCoffee(c,s,text,accent,water,rule){
 var lower=s.nodes[0],upper=s.nodes[1],lowerY=360-120*Math.min(1,lower.v/lower.capacity),upperY=195-99*Math.min(1,upper.v/upper.capacity),flow=Math.abs(s.flows.tube||0);
 c.save();c.lineJoin='round';c.lineCap='round';c.textAlign='center';
 c.strokeStyle=rule;c.lineWidth=16;c.beginPath();c.moveTo(360,300);c.lineTo(360,169);c.stroke();
 if(flow>1e-8){c.strokeStyle=water;c.lineWidth=Math.min(10,3+flow*35000);c.stroke();c.fillStyle=water;c.beginPath();var arrow=s.flows.tube>0?222:246;c.moveTo(349,arrow);c.lineTo(371,arrow);c.lineTo(360,arrow+(s.flows.tube>0?-12:12));c.fill();}
 c.beginPath();c.moveTo(280,96);c.lineTo(440,96);c.quadraticCurveTo(430,173,410,195);c.lineTo(310,195);c.quadraticCurveTo(290,173,280,96);c.closePath();
 c.save();c.clip();c.fillStyle=water;c.globalAlpha=.48;c.fillRect(280,upperY,160,196-upperY);c.restore();c.strokeStyle=accent;c.lineWidth=3;c.stroke();
 c.beginPath();c.moveTo(309,233);c.bezierCurveTo(276,259,273,318,307,348);c.quadraticCurveTo(360,382,413,348);c.bezierCurveTo(447,318,444,259,411,233);c.closePath();
 c.save();c.clip();c.fillStyle=water;c.globalAlpha=.48;c.fillRect(280,lowerY,160,362-lowerY);c.restore();c.strokeStyle=accent;c.stroke();
 c.strokeStyle=s.heater?accent:rule;c.lineWidth=5;c.beginPath();for(var i=0;i<7;i++){var x=315+i*15,y=381+(i%2)*7;if(!i)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();
 c.fillStyle=text;c.font='12px "Commit Mono", monospace';c.fillText('Coffee bowl',360,79);c.fillText('Sealed lower flask',220,218);c.fillText((upper.v*1000).toFixed(2)+' L',360,177);c.fillText((lower.v*1000).toFixed(2)+' L',360,346);
 c.font='11px "Commit Mono", monospace';c.fillText(s.heater?'Heater on':'Cooling',202,385);c.fillText(s.notice,519,385);c.font='10px "Commit Mono", monospace';c.fillText('Finite-volume model. Heating lifts water; cooling draws it back through the same tube.',360,409);c.restore();
}
function drawModel(c,s){
 var text=color('--text','#e8e2d6'),accent=color('--accent','#d4c4a0'),water=color('--toy-water','#8fb3c7'),rule=color('--rule-strong','#5a675c');
 if(s.id==='glass-toilet'){drawToilet(c,s,text,accent,water,rule);return;}
 if(s.id==='vacuum-coffee'){drawCoffee(c,s,text,accent,water,rule);return;}
 c.save();c.font='12px "Commit Mono", monospace';c.textAlign='center';
 s.links.forEach(function(l){var a=l.a,b=l.b,ax=a.x+a.w,ay=a.y+a.h*.7,bx=b.x,by=b.y+b.h*.7;c.strokeStyle=rule;c.lineWidth=8;c.beginPath();c.moveTo(ax,ay);c.lineTo((ax+bx)/2,ay);c.lineTo((ax+bx)/2,by);c.lineTo(bx,by);c.stroke();if(Math.abs(l.q)>1e-9){c.strokeStyle=water;c.lineWidth=Math.min(5,1+Math.abs(l.q)*16000);c.stroke();var x=(ax+bx)/2,dir=l.q>0?1:-1;c.fillStyle=water;c.beginPath();c.moveTo(x,by-5);c.lineTo(x+dir*8,by);c.lineTo(x,by+5);c.fill();}});
 s.nodes.forEach(function(n){var fill=n.h*Math.max(0,Math.min(1,n.v/n.capacity));c.strokeStyle=accent;c.lineWidth=2;c.strokeRect(n.x,n.y,n.w,n.h);c.globalAlpha=.43;c.fillStyle=water;c.fillRect(n.x+2,n.y+n.h-fill,n.w-4,Math.max(0,fill-2));c.globalAlpha=1;c.fillStyle=text;c.fillText(n.label,n.x+n.w/2,n.y-9);c.fillText((n.v*1000).toFixed(n.capacity>.002?2:3)+' L',n.x+n.w/2,n.y+n.h-10);});
 if(s.id==='water-half-adder'){
  var chamber=s.nodes[2],level=chamber.v/chamber.capacity,fy=chamber.y+chamber.h*(1-level)-8;
  c.strokeStyle=accent;c.fillStyle=accent;c.lineWidth=2;c.beginPath();c.arc(398,Math.max(chamber.y+10,Math.min(chamber.y+chamber.h-10,fy)),8,0,Math.PI*2);c.fill();
  c.fillStyle=text;c.font='11px "Commit Mono", monospace';
  c.fillText('A '+Number(s.inputs[0])+' + B '+Number(s.inputs[1])+'   SUM '+Number(s.outputs[0]>1e-6)+'   CARRY '+Number(s.outputs[1]>1e-6),360,362);
 }
 if(s.T){var flask=s.nodes[0];c.strokeStyle=s.heater?accent:rule;c.lineWidth=5;c.beginPath();for(var i=0;i<7;i++){var x=flask.x+36+i*13,y=flask.y+flask.h+11+(i%2)*8;if(!i)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();}
 if(s.id==='hero-temple-doors'){c.strokeStyle=accent;c.lineWidth=4;var x=362,y=288;[-1,1].forEach(function(side){c.beginPath();c.moveTo(x+side*20,y);c.lineTo(x+side*(20+44*Math.sin(s.angle)),y-76*Math.cos(s.angle*.5));c.stroke();});c.fillStyle=text;c.fillText((s.angle*180/Math.PI).toFixed(0)+' degrees',x,315);}
 if(s.id==='slime-heart'){c.strokeStyle=accent;c.lineWidth=3;c.beginPath();c.ellipse(356,265,65-s.x*650,48,0,0,2*Math.PI);c.stroke();}
 if(s.voices){s.voices.forEach(function(v,i){var x=292+i*38,y=190-v.length*220;c.strokeStyle=v.active?accent:rule;c.lineWidth=5;c.beginPath();c.moveTo(x,198);c.lineTo(x,y);c.stroke();c.fillStyle=text;c.font='10px "Commit Mono", monospace';c.fillText(Math.round(v.frequency),x,y-8);});if(s.id==='singing-birds-owl'){c.save();c.translate(534,188);c.rotate(s.angle);c.strokeStyle=accent;c.lineWidth=3;c.beginPath();c.ellipse(0,0,26,36,0,0,Math.PI*2);c.moveTo(-18,-26);c.lineTo(-24,-46);c.lineTo(-3,-33);c.moveTo(18,-26);c.lineTo(24,-46);c.lineTo(3,-33);c.stroke();c.fillStyle=text;c.beginPath();c.arc(-10,-9,3,0,Math.PI*2);c.arc(10,-9,3,0,Math.PI*2);c.fill();c.restore();}}
 c.font='12px "Commit Mono", monospace';c.fillStyle=text;c.fillText(s.notice,360,382);c.font='10px "Commit Mono", monospace';c.fillText('Finite-volume model. Pipe flow follows pressure and head.',360,400);c.restore();
}
function reduced(c){var d=c.definition,s=root.WSSWorkshopModels.create(d.name,d.workshop.options),audio=createAudio(),retired=false;
 function controls(){return s.controls.map(function(b,i){var cols=s.controls.length>4?3:s.controls.length;return{id:i===0?'primary':'workshop-'+b.id,label:typeof b.label==='function'?b.label():b.label,x:120+(i%cols)*(480/Math.max(1,cols-1)),y:22+Math.floor(i/cols)*42,width:s.controls.length>4?152:180,height:36,hold:b.held,kind:'runtime',pointerMode:'button'};});}
 return{smoke:false,clock:function(){return s.t;},controls:controls,activate:function(id,held){if(id==='primary')s.activate(s.controls[0].id,held!==false);else if(id.indexOf('workshop-')===0)s.activate(id.slice(9),held!==false);else return false;audio.set(!!s.sound);return true;},primary:function(){return false;},release:function(){s.release();},setActive:function(active){if(!active)s.release();audio.active(active);},tick:function(dt){if(retired)return;s.step(Math.min(.1,dt)*(c.timeScale?c.timeScale():1));if(s.voices)audio.update(s.voices);},draw:function(ctx){drawModel(ctx,s);},stats:function(){var result=cloneStats(s);result.audio=audio.stats();return result;},destroy:function(){retired=true;s.release();audio.destroy();}};
}
function particleRows(c){var p=c.sampleParticles?c.sampleParticles():null;if(!p)return[];var rows=[];for(var i=0;i<p.count;i++){var x=p.x[i],y=p.y[i];if(Number.isFinite(x+y)&&x>=0&&y>=0)rows.push({x:x,y:y,vx:p.vx?p.vx[i]:0,vy:p.vy?p.vy[i]:0});}return rows;}
function native(c){var d=c.definition,id=d.name,clock=c.liquid.simulationClock,start=clock,samples=0,peak=0,minimum=Infinity,runup=0,spout=0,periods=[1.5,2.5,4,6,9],periodIndex=2,automatic=false,autoClock=0,spectrum=[],audio=createAudio(),sound=false,tones=[],lastBirths=0,events=0,retired=false,active=true,lastBubbleClock=-1,particleCount=0,energyInitial=null;
 var inlet=d.boundaries&&d.boundaries.tap,enabled=!!inlet;
 function controls(){var out=[];function add(id,label,x){out.push({id:'workshop-'+id,label:label,x:x,y:44,width:168,height:36,kind:'runtime',pointerMode:'button'});}
  if(id==='sloshing-resonance'){add('period','Period '+(c.wave?c.wave.stats().period:0).toFixed(1)+' s',316);add('sweep',automatic?'Stop sweep':'Sweep periods',524);}
  if(id==='tsunami-runup')add('pulse','Launch one wave',400);
  if(id==='hellbrunn-fountains')add('trick',automatic?'Guest trigger on':'Guest trigger off',504);
  if(id==='ringing-bubbles')add('sound',sound?'Mute bubble tones':'Hear bubble tones',540);
  return out;
 }
 function activate(control,held){if(held===false)return true;var key=control.replace('workshop-','');if(key==='period'){periodIndex=(periodIndex+1)%periods.length;c.wave.setPeriod(periods[periodIndex]);peak=0;minimum=Infinity;}else if(key==='sweep'){automatic=!automatic;autoClock=0;}else if(key==='pulse')c.wave.pulse();else if(key==='trick')automatic=!automatic;else if(key==='sound'){sound=!sound;audio.set(sound);}else return false;return true;}
 function tick(){if(retired)return;var now=c.liquid.simulationClock,dt=Math.max(0,now-clock);clock=now;if(dt<=0)return;var points=particleRows(c);particleCount=points.length;samples++;
  if(id==='ringing-bubbles'&&c.bubbles){var b=c.bubbles.stats();if(b.captureClock!==lastBubbleClock){var elapsed=lastBubbleClock<0?0:Math.max(0,b.captureClock-lastBubbleClock),previous=tones.slice();lastBubbleClock=b.captureClock;events+=Math.max(0,b.births-lastBirths);lastBirths=b.births;tones=b.points.slice(0,8).map(function(p){var radius=p.radius*.0254/24,frequency=Math.sqrt(3*1.4*101325/1000)/(2*Math.PI*radius),nearest=-1,distance=32;previous.forEach(function(t,i){var gap=Math.hypot(t.x-p.x,t.y-p.y);if(gap<distance){distance=gap;nearest=i;}});var prior=nearest>=0?previous.splice(nearest,1)[0]:null,energy=prior?prior.energy*Math.exp(-5*elapsed):.025*Math.pow(radius/.005,3);return{frequency:frequency,power:Math.min(.04,energy*5),energy:energy,radius:radius,x:p.x,y:p.y};});}audio.update(tones);}
  if(id==='hellbrunn-fountains'&&automatic&&c.nativeBoundary){enabled=(c.bodies||[]).some(function(b){return b.cx>260&&b.cx<470&&b.cy>280;});c.nativeBoundary.setTapEnabled(enabled);}
  var right=points.filter(function(p){return p.x>648&&p.x<672;}),top=right.length?right.map(function(p){return p.y;}).sort(function(a,b){return a-b;})[Math.floor(right.length*.025)]:376;
  if(id==='sloshing-resonance'&&right.length>100){var h=Math.max(0,376-top);peak=Math.max(peak,h);minimum=Math.min(minimum,h);autoClock+=dt;if(automatic&&autoClock>=c.wave.stats().period*4){spectrum.push({period:c.wave.stats().period,amplitude:(peak-minimum)/2,samples:samples});autoClock=0;periodIndex=(periodIndex+1)%periods.length;c.wave.setPeriod(periods[periodIndex]);peak=0;minimum=Infinity;}}
  if(id==='tsunami-runup')runup=Math.max(runup,...points.filter(function(p){return p.x>484;}).map(function(p){return Math.max(0,(d.workshop.restSurface||328)-p.y);}));
  if(id==='blowhole')spout=Math.max(spout,...points.filter(function(p){return p.x>604&&p.x<644;}).map(function(p){return Math.max(0,(d.workshop.spoutY||224)-p.y);}));
  if(id==='perpetual-motion'){peak=points.reduce(function(sum,p){return sum+Math.max(0,384-p.y)*250+.5*(p.vx*p.vx+p.vy*p.vy);},0);minimum=Math.min(minimum,peak);if(energyInitial===null)energyInitial=peak;}
 }
 return{smoke:false,controls:controls,activate:activate,release:function(){},setActive:function(value){active=value;audio.active(value);},tick:tick,draw:function(ctx){ctx.save();ctx.fillStyle=color('--text','#e8e2d6');ctx.textAlign='center';ctx.font='12px "Commit Mono", monospace';var label=id==='sloshing-resonance'?'Measured swing '+(Number.isFinite(minimum)?(peak-minimum).toFixed(1):'0')+' px':id==='tsunami-runup'?'Highest run-up '+runup.toFixed(1)+' px':id==='blowhole'?'Measured spout rise '+spout.toFixed(1)+' px':id==='perpetual-motion'?'Finite water. No external pump. Energy index '+Math.round(peak):id==='ringing-bubbles'?'Bubble radii set '+tones.length+' resonant tones':id==='hellbrunn-fountains'?'Pump '+(c.nativeBoundary&&c.nativeBoundary.stats().tapEnabled?'on':'off')+(automatic?' (guest trigger)':' (manual)'):'';ctx.fillText(label,360,96);ctx.restore();},stats:function(){return{ready:true,finite:Number.isFinite(peak+runup+spout),model:'Native liquid with measured workshop controls',clock:clock-start,samples:samples,amplitude:Number.isFinite(minimum)?(peak-minimum)/2:0,runup:runup,spout:spout,energyIndex:peak,energyInitial:energyInitial,particleCount:particleCount,spectrum:spectrum,wave:c.wave?c.wave.stats():null,tones:tones,bubbleEvents:events,audio:audio.stats(),automatic:automatic,active:active};},destroy:function(){retired=true;audio.destroy();}};
}
var previous=root.WSSDraftRuntime;
root.WSSDraftRuntime={create:function(c){if(!c.definition.workshop)return previous&&previous.create?previous.create(c):null;return c.definition.reducedModel?reduced(c):native(c);}};
root.WSSWorkshopRuntime={reduced:reduced,native:native};
})(typeof window!=='undefined'?window:globalThis);
