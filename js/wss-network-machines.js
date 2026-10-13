/* Finite hydraulic networks for the water-machine workshop. Each tank owns its
 * water inventory. Orifice flow follows measured head, valves and pump work;
 * every transfer is balanced before drawing. These are 2D section models,
 * with explicit limits in each scene, rather than particle motion stand-ins.
 */
(function(root){
'use strict';
var M=root.WSSMachines=root.WSSMachines||{};
var ids=['cup-synchronization','intermittent-fountain','binary-staircase','mariotte-bottle','banu-musa-fountain','bottle-glass-pitch','fountain-music','galileo-well','vacuum-siphon','bramah-press','hero-vending','hero-drinking-animal','jazari-peacock','moniac','lukyanov-integrator','parts-budget-puzzles','pneumatica-campaign','garden-automation','fire-brigade','water-chain-reaction'];
var labels={
'cup-synchronization':'Coupled self-flushing cups','intermittent-fountain':'Intermittent fountain','binary-staircase':'Binary staircase','mariotte-bottle':'Mariotte constant bottle','banu-musa-fountain':'Banu Musa changing fountain','bottle-glass-pitch':'Bottles and glasses','fountain-music':'Playable fountain show','galileo-well':"Galileo's suction well",'vacuum-siphon':'Siphon in a vacuum','bramah-press':"Bramah's hydraulic press",'hero-vending':"Hero's vending machine",'hero-drinking-animal':"Hero's drinking animal",'jazari-peacock':"Al-Jazari's peacock washer",'moniac':'MONIAC water economy','lukyanov-integrator':'Lukyanov water integrator','marly-machine':'Machine de Marly','parts-budget-puzzles':'Parts-budget puzzles','pneumatica-campaign':'Pneumatica campaign','garden-automation':'Automate the garden','fire-brigade':'Fire brigade','water-chain-reaction':'Water chain reaction'};
function rect(x,y,width,height){return{x:x,y:y,width:width,height:height};}
function tank(id,label,x,y,w,h,f){return{id:id,label:label,rect:rect(x,y,w,h),volume:w*(h-12)*(f||0),capacity:w*(h-12)};}
function edge(id,a,b,bore,extra){return Object.assign({id:id,a:a,b:b,bore:bore,open:true,length:80,flow:0},extra||{});}
function H(n){return n.rect.y+n.rect.height;}
function nodeHead(n){return -H(n)+n.volume/n.rect.width+(n.pressure||0)/250;}
function model(id,o){
  o=o||{};
  var n=[],e=[],u={running:true,pressed:false,mode:0,stage:0,coin:0,angle:0,omega:0,energy:0,heat:[1,1,1],fuel:0,prime:true},primary='Pause supply',extra=[];
  function T(a,b,x,y,w,h,f){n.push(tank(a,b,x,y,w,h,f));return a;}
  function E(a,b,c,w,opts){e.push(edge(a,b,c,w,opts));return a;}
  function K(id,label,x,y,mode){extra.push({id:id,label:label,x:x,y:y,width:90,height:32,mode:mode||'toggle'});}
  if(id==='cup-synchronization'){
    T('basin','Shared basin',60,300,600,74,.50);T('left','Left cup',110,120,130,170,Number.isFinite(o.leftFill)?Math.max(.50,Math.min(.54,o.leftFill)):.52);T('right','Right cup',480,120,130,170,.48);
    E('feedL','basin','left',8,{pump:210});E('feedR','basin','right',8,{pump:210});E('drainL','left','basin',20,{siphon:true,crest:.58,reset:.09});E('drainR','right','basin',20,{siphon:true,crest:.58,reset:.09});E('coupling','left','right',3,{open:o.coupled!==false});
    primary='Stop return pump';K('coupling','Separate cups',564,46);extra[extra.length-1].width=128;u.lastFlush=[null,null];u.flushes=[0,0];
  }else if(id==='intermittent-fountain'){
    T('basin','Receiver',80,296,560,76,.75);T('cup','Trigger cup',105,120,205,162,.18);T('jet','Jet tube',460,140,125,144,0);
    E('feed','basin','cup',8,{pump:210});E('flush','cup','jet',16,{siphon:true,crest:.77,reset:.10});E('fall','jet','basin',22);primary='Stop return pump';
  }else if(id==='binary-staircase'){
    T('supply','Input water',68,70,112,244,.90);for(var i=0;i<3;i++)T('b'+i,'Bit '+(i+1),218+i*152,120+i*36,112,212-i*36,0);
    for(i=0;i<3;i++)n[i+1].capacity=5000;
    E('input','supply','b0',12,{open:false});E('carry0','b0','b1',12,{open:false});E('carry1','b1','b2',12,{open:false});E('overflow','b2','supply',12,{open:false});primary='Add one water pulse';
  }else if(id==='mariotte-bottle'){
    T('bottle','Sealed bottle',130,70,205,290,.92);T('receiver','Receiver',425,180,230,180,0);
    E('outlet','bottle','receiver',12,{mariotte:true,intake:.46});primary='Close outlet';K('air-tube','Move air tube',314,97);K('vent','Vent bottle',548,95);
  }else if(id==='banu-musa-fountain'){
    T('supply','Supply',72,80,172,276,.9);T('left','Left jet',270,180,132,176,Number.isFinite(o.leftFill)?Math.max(.38,Math.min(.42,o.leftFill)):.40);T('right','Right jet',488,180,132,176,0);
    E('routeL','supply','left',10,{autoRoute:0});E('routeR','supply','right',10,{autoRoute:1});E('returnL','left','right',4);primary='Change route';u.autoSwitch=o.autoSwitch!==false;u.floatArmed=[true,true];u.switches=0;
  }else if(id==='bottle-glass-pitch'){
    T('supply','Water',60,154,185,210,Number.isFinite(o.sourceFill)?Math.max(.85,Math.min(.95,o.sourceFill)):.90);T('bottle','Air bottle',300,104,170,260,.18);T('glass','Vibrating glass',525,214,110,150,0);
    E('fill','supply','bottle',8,{valve:true,open:o.filling!==false});E('glass-fill','supply','glass',8,{valve:true,open:o.filling!==false});primary=o.filling===false?'Fill both':'Stop filling';
    K('drain','Drain both',92,100);K('tap','Blow bottle',570,28);K('glass-tap','Tap glass',570,100);
  }else if(id==='fountain-music'){
    T('basin','Recirculating basin',82,294,556,76,.75);for(var j=0;j<4;j++){T('jet'+j,'Jet '+(j+1),136+j*145,152,80,126,0);E('note'+j,'basin','jet'+j,5,{pump:168,open:false});E('return'+j,'jet'+j,'basin',10);K('note'+j,'Note '+(j+1),163+j*145,92);}
    primary='Play all jets';
  }else if(id==='galileo-well'){
    T('well','Deep well',76,238,235,122,.85);T('upper','Upper receiver',430,80,198,150,0);E('lift','well','upper',12,{pump:200,vaporLimit:true});primary='Start suction pump';u.running=false;K('scale','Try 100 foot well',554,113);
  }else if(id==='vacuum-siphon'){
    T('source','Raised source',78,140,220,215,.84);T('receiver','Receiver',440,223,200,132,.08);E('siphon','source','receiver',16,{siphon:true,crest:.60,reset:.04,vaporLimit:true});primary='Break prime';K('air','Room air / vacuum',372,85);
  }else if(id==='bramah-press'){
    T('small','Small piston',142,115,105,245,Number.isFinite(o.smallFill)?Math.max(.53,Math.min(.59,o.smallFill)):.56);T('large','Large piston',400,115,220,245,.56);E('hydraulic','small','large',20,{open:false,check:true});primary='Push small piston';K('load','Add heavy load',530,46);u.mode=o.heavy?1:0;u.pressTime=o.noOpeningPress?0:1.2;
  }else if(id==='hero-vending'){
    T('supply','Supply',95,75,200,280,Number.isFinite(o.sourceFill)?Math.max(.8,Math.min(.9,o.sourceFill)):.85);T('drink','Measured drink',440,230,175,125,0);E('coin-valve','supply','drink',12,{open:false});primary='Drop a coin';K('reset','Return coin',520,145);
    u.coin=o.coin===false?0:.001;u.coinVelocity=0;u.leverAngle=0;u.leverVelocity=0;
  }else if(id==='hero-drinking-animal'){
    T('bowl','Drinking bowl',85,220,220,135,Number.isFinite(o.bowlFill)?Math.max(.70,Math.min(.80,o.bowlFill)):.75);
    T('stomach','Animal reservoir',425,155,205,200,.06);
    E('straw','bowl','stomach',8,{pump:130,check:true,open:o.suction!==false});
    u.pressed=o.suction!==false;primary=u.pressed?'Stop suction':'Start suction';
  }else if(id==='jazari-peacock'){
    T('supply','Finite supply',75,70,210,285,.86);T('bowl','Wash bowl',425,245,210,110,0);E('serve','supply','bowl',12,{open:false});E('empty','bowl','supply',6,{open:false,pump:260});primary='Serve water';
  }else if(id==='moniac'){
    T('t0','Treasury',32,70,113,102,.85);T('t1','Firms',171,150,113,102,.11);T('t2','Households',310,230,113,102,.11);T('t3','Savings',449,150,113,102,.11);T('t4','Imports',588,230,100,102,.11);
    E('spend','t0','t1',7);E('wages','t1','t2',7);E('tax','t2','t0',5,{pump:240});E('saving','t2','t3',4,{pump:105});E('investment','t3','t1',5,{pump:95});E('imports','t2','t4',4);E('revenue','t4','t0',3,{pump:245});primary='Raise spending';K('tax-control','Raise tax',350,115);K('save-control','Raise saving',515,115);
  }else if(id==='lukyanov-integrator'){
    for(var l=0;l<4;l++)T('t'+l,'Layer '+(l+1),65+l*169,115,132,240,l===0?.65:.25);
    for(l=0;l<3;l++)E('diffuse'+l,'t'+l,'t'+(l+1),5,{conductance:2.2});primary='Apply heat pulse';K('resistance','Change resistance',540,115);
  }else if(id==='marly-machine'){
    T('river','Upstream river',50,212,242,118,.80);T('tail','Downstream river',328,305,150,70,.10);T('upper','Upper reservoir',525,72,130,175,.05);
    E('wheel','river','tail',18,{open:false});E('pump','river','upper',10,{pump:260,open:false,wheelDriven:true});E('spill','upper','tail',3,{threshold:.86});primary='Engage river wheel';u.running=false;
  }else if(id==='parts-budget-puzzles'){
    T('source','Source',62,95,190,255,.9);T('middle','Intermediate',285,170,150,180,0);T('receiver','Goal',472,210,175,140,0);
    E('part0','source','middle',9,{open:false});E('part1','middle','receiver',9,{open:false});E('part2','source','receiver',6,{open:false});primary='Place first link';K('part1','Place second link',358,115);K('part2','Place shortcut (2 parts)',541,115);u.budget=2;
  }else if(id==='pneumatica-campaign'){
    T('source','Supply',70,85,180,270,.92);T('one','First receiver',280,150,120,205,0);T('two','Second receiver',430,190,112,165,0);T('goal','Final goal',570,220,115,135,0);
    E('gate0','source','one',9,{open:false});E('gate1','one','two',9,{open:false});E('gate2','two','goal',9,{open:false});primary='Build first link';K('gate1','Build second link',359,115);K('gate2','Build final link',521,115);
  }else if(id==='garden-automation'){
    T('supply','Supply',62,85,180,270,.93);for(var g=0;g<3;g++){T('soil'+g,'Planter '+(g+1),280+143*g,213,112,142,Math.max(.1,Math.min(.2,Number.isFinite(o.soilFill)?o.soilFill:.15)));E('irrigate'+g,'supply','soil'+g,5,{open:false});}
    primary=o.running===false?'Start moisture control':'Stop moisture control';u.running=o.running!==false;K('sensor','Adjust dry threshold',416,145);
  }else if(id==='fire-brigade'){
    T('tank','Rescue water',62,100,175,255,.85);for(var f=0;f<3;f++){T('fire'+f,'Fire '+(f+1),275+142*f,233,105,120,0);E('hose'+f,'tank','fire'+f,8,{open:f===0,pump:185});K('hose'+f,'Aim at fire '+(f+1),313+142*f,105);}
    primary='Start hose';u.running=false;
  }else if(id==='water-chain-reaction'){
    T('supply','Finite starter',40,100,142,245,Number.isFinite(o.sourceFill)?Math.max(.76,Math.min(.88,o.sourceFill)):.82);for(var c=0;c<3;c++)T('stage'+c,'Stage '+(c+1),206+158*c,112+c*55,112,233-c*55,0);
    E('trigger0','supply','stage0',8,{open:o.started!==false});E('trigger1','stage0','stage1',8,{threshold:.08});E('trigger2','stage1','stage2',8,{threshold:.08});primary=o.started===false?'Open starter gate':'Close starter gate';
  }
  return {nodes:n,edges:e,state:u,primary:primary,controls:extra};
}
function make(id,w,o){
  if(!w || w.w!==720 || w.h!==400)throw Error('Network scenes need a 720 by 400 box.');
  var net=model(id,o),view=rect(20,42,680,330),vessels=net.nodes.map(function(n){return{id:n.id,label:n.label,rect:n.rect,sealed:false};});
  if(id==='bottle-glass-pitch')vessels=[];
  var pipes=[];
  var entry=root.WSSMachineRegistry&&root.WSSMachineRegistry.lookup(id),caption=entry&&entry.cue||'Operate the apparatus. Water moves through its measured levels, pressure differences, valves and pumps.';
  var energyNote=id==='marly-machine'?'External river inflow and outflow are recorded. Falling river water drives the wheel; its available head and a stated 58 percent efficiency limit the lifted flow.':id==='moniac'?'This is a water analog of monetary flow, not a calibrated economic forecast. Declared return pumps recirculate its conserved working water.':id==='binary-staircase'?'Each input removes a measured water pulse from the finite supply. A two-pulse tipping bucket passes half its water upward and returns half to supply, conserving the count fluid.':id==='garden-automation'?'Gravity supplies the irrigation head. Flow resistance dissipates it, while the declared soil-uptake sink removes finite water from the system. No plant metabolism or closed energy budget is modeled.':id==='hero-vending'?'The coin falls under gravity and loads a spring and damper. Its lever opens the water valve; water then drains from a finite raised supply. The mechanical linkage and pipe loss are reduced, without a closed energy budget.':'Pumps and hand inputs supply declared external work. Gravity and pressure set flow direction; friction dissipates energy. This model is not a closed account of heat, sound or detailed fluid momentum.';
  if(id==='cup-synchronization')energyNote='A declared return pump lifts finite water from the shared basin into both cups. Their siphons drain it back. The cross-connection transfers water by head difference without a separate motor; port loss dissipates energy. This is a reduced hydraulic model.';
  if(id==='bottle-glass-pitch')energyNote='Finite water flows by gravity into both vessels. Bottle pitch follows a Helmholtz air-cavity estimate; glass pitch follows an approximate added-water modal mass. The audible tones are synthesized on demand and do not feed back into water motion.';
  if(id==='bramah-press')energyNote='A declared hand stroke applies about 30 kPa to the smaller piston. The larger piston has 2.1 times its area, so it moves about half as far under the same transmitted pressure. The removable heavy load needs more pressure than that stroke supplies. Port loss and piston inertia are reduced.';
  if(id==='water-chain-reaction')energyNote='The finite raised starter supplies all gravity head. No pump or hidden refill runs. Port loss dissipates energy, while local turbulence and detailed gate inertia are outside this reduced model.';
  if(id==='banu-musa-fountain'){energyNote='The finite raised supply provides the gravity head. Rising floats switch a two-way valve when they reach the marked level; a lower reset level prevents chatter. Pipe losses dissipate energy. The float-to-valve linkage is schematic.';caption='As one jet cup fills to its marked float line, the valve directs the next pour to the other jet. The raised supply is finite. Use the button to switch it by hand.';}
  if(id==='hero-drinking-animal'){vessels=vessels.filter(function(v){return v.id==='bowl';});energyNote='The animal applies a declared 32.5 kPa mouth suction while drinking. A one-way straw carries conserved water from the finite bowl into its body reservoir. Muscle work is external; detailed breathing and swallowing are not modeled.';caption='The animal drinks through its straw as soon as the scene opens. Stop suction to leave the water in the bowl, then start again to watch the body reservoir fill.';}
  return{name:id,title:labels[id],draft:true,setup:'network',viewBounds:view,vessels:vessels,pipes:pipes,solids:[],vents:[],parts:[],slimes:[],initial:[],marks:[],meters:[],settings:{enabled:false},primary:{kind:'network',target:{x:364,y:46}},action:net.primary,caption:caption,readingLabel:'Finite water network',measure:{source:net.nodes[0].rect,receiver:net.nodes[net.nodes.length-1].rect},network:net,reducedModel:true,boundaryNote:id==='hero-drinking-animal'?'The shaped animal is a section view of a finite body reservoir, not a soft-body slime. A declared 32.5 kPa mouth suction moves conserved water through a one-way straw. The water level represents stored volume; local swallowing, splashes and tissue motion are not resolved.':id==='banu-musa-fountain'?'Finite tank levels and port head drive the two jets. The outlet manifold starts primed with its intake below the supply surface. A float crossing the marked level operates an ideal two-way valve with hysteresis. Water in the manifold and local splashes are not separately resolved.':id==='garden-automation'?'Reduced finite-volume water follows pressure and gravity through three independent valves. Each valve opens when its measured planter falls below the selected threshold. A declared constant soil-uptake sink removes water and is recorded in the mass ledger. The drawing is a schematic; plant growth, soil pores and local turbulence are not simulated.':id==='hero-vending'?'A falling coin loads a spring-mounted lever with finite inertia. Lever angle opens or closes the valve; the finite raised water supply drains only through that gate. Returning the coin removes its weight and lets the spring close the gate. The pipes and mechanical linkage are a reduced two-dimensional section.':'This scene uses a reduced two-dimensional finite-volume hydraulic model. Tank inventories are conserved, pressure and level differences drive each flow, and any pump or hand action is declared. Pipe shape is a schematic of the network; local turbulence, bubbles and particle contacts are outside this model.',energyBudgetStatus:energyNote};
}
function create(c){
  var d=c.definition,net=d.network;
  if(!net)return null;
  var n=net.nodes,e=net.edges,s=net.state,by=Object.create(null),byEdge=Object.create(null),t=0,initial=0,added=0,removed=0,totalFlow=0,completed=false,events=0,energy=0,controls=net.controls;
  var audio=null,audioActive=false,voices=[];
  function audioContext(){if(audio)return audio;var Context=root.AudioContext||root.webkitAudioContext;if(!Context)return null;audio=new Context();return audio;}
  function bottleFrequency(){var fill=Math.max(.02,Math.min(.97,fraction(by.bottle))),airVolume=.004*(1-fill),neckArea=.0004,neckLength=.015;return Math.min(1200,Math.max(110,343/(2*Math.PI)*Math.sqrt(neckArea/(airVolume*neckLength))));}
  function glassFrequency(){return 800/Math.sqrt(1+2.4*fraction(by.glass));}
  function tapResonator(frequency){var ctx=audioContext();if(!ctx)return;ctx.resume();var oscillator=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime;oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.09,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+.42);oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(now);oscillator.stop(now+.44);s.soundEvents=(s.soundEvents||0)+1;}
  function updateMusic(){if(d.name!=='fountain-music'||!audio)return;var ctx=audio;for(var i=0;i<4;i++){var v=voices[i],pipe=byEdge['note'+i];if(!v)continue;var target=audioActive&&pipe.open&&pipe.flow>1?Math.min(.035,.006+pipe.flow/30000):.0001;v.gain.gain.setTargetAtTime(target,ctx.currentTime,.04);}}
  function ensureMusic(){var ctx=audioContext();if(!ctx)return;ctx.resume();if(voices.length)return;for(var i=0;i<4;i++){var oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type='sine';oscillator.frequency.value=[261.63,329.63,392,523.25][i];gain.gain.value=.0001;oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start();voices.push({oscillator:oscillator,gain:gain});}}
  n.forEach(function(a){by[a.id]=a;initial+=a.volume;});e.forEach(function(a){byEdge[a.id]=a;a.flow=0;a.primed=false;});
  function fraction(a){return a.volume/a.capacity;}
  function move(a,b,q){var v=Math.min(Math.max(0,q),a.volume,b.capacity-b.volume);if(v>0){a.volume-=v;b.volume+=v;totalFlow+=v;}return v;}
  function setMessage(){var id=d.name;
    if(id==='cup-synchronization'||id==='intermittent-fountain')d.action=s.running?'Stop return pump':'Start return pump';
    else if(id==='mariotte-bottle')d.action=byEdge.outlet.open?'Close outlet':'Open outlet';
    else if(id==='bottle-glass-pitch')d.action=byEdge.fill.open?'Stop filling':'Fill both';
    else if(id==='fountain-music')d.action=e.some(function(x){return /^note/.test(x.id)&&x.open;})?'Stop all jets':'Play all jets';
    else if(id==='galileo-well')d.action=s.running?'Stop suction pump':'Start suction pump';
    else if(id==='vacuum-siphon')d.action=s.prime?'Break prime':'Prime siphon';
    else if(id==='hero-vending')d.action=s.coin>0?'Drop another coin':'Drop a coin';
    else if(id==='bramah-press')controls[0].label=s.mode?'Remove heavy load':'Add heavy load';
    else if(id==='hero-drinking-animal')d.action=s.pressed?'Stop suction':'Start suction';
    else if(id==='jazari-peacock')d.action=s.running?'Stop washer':'Start washer';
    else if(id==='moniac')d.action=byEdge.spend.bore>7?'Lower spending':'Raise spending';
    else if(id==='marly-machine')d.action=s.running?'Stop river wheel':'Engage river wheel';
    else if(id==='garden-automation')d.action=s.running?'Stop moisture control':'Start moisture control';
    else if(id==='fire-brigade')d.action=s.running?'Stop hose':'Start hose';
    else if(id==='water-chain-reaction')d.action=byEdge.trigger0.open?'Close starter gate':'Open starter gate';
    if(id==='cup-synchronization'){var gap=s.lastFlush[0]!==null&&s.lastFlush[1]!==null?Math.abs(s.lastFlush[0]-s.lastFlush[1]).toFixed(1)+' s flush gap':'waiting for first flush';d.readingLabel=(byEdge.coupling.open?'Joined cups, ':'Separate cups, ')+gap;controls[0].label=byEdge.coupling.open?'Separate cups':'Join cups';}
    else if(id==='intermittent-fountain')d.readingLabel=byEdge.flush.primed?'Jet running':'Cup filling';
    else if(id==='binary-staircase')d.readingLabel='Stored bits '+[2,1,0].map(function(k){return by['b'+k].volume>=2500?1:0;}).join('');
    else if(id==='mariotte-bottle')d.readingLabel='Outlet '+(byEdge.outlet.open?'open':'closed')+', '+(s.mode?'open jar':fraction(by.bottle)>byEdge.outlet.intake?'constant head':'falling head');
    else if(id==='banu-musa-fountain')d.readingLabel='Float switches '+s.switches+', '+(s.mode?'right':'left')+' jet';
    else if(id==='bottle-glass-pitch')d.readingLabel='Bottle '+Math.round(bottleFrequency())+' Hz, glass '+Math.round(glassFrequency())+' Hz';
    else if(id==='fountain-music')d.readingLabel='Playing '+e.filter(function(v){return /^note/.test(v.id)&&v.open;}).length+' water jets';
    else if(id==='galileo-well')d.readingLabel=(s.running?'Pumping':'Stopped')+' at '+(s.mode?'100':'30')+' feet';
    else if(id==='vacuum-siphon')d.readingLabel=(s.prime?'Primed':'Unprimed')+', '+(s.mode?'vacuum':'room air');
    else if(id==='bramah-press')d.readingLabel='Large piston lift '+Math.round((fraction(by.large)-.56)*by.large.rect.height)+' px';
    else if(id==='hero-vending')d.readingLabel=s.coin>0?(s.coin>=1?'Coin holds valve':'Coin falling'):'Insert a coin';
    else if(id==='hero-drinking-animal')d.readingLabel=(s.pressed?'Mouth suction -32.5 kPa':'Mouth released')+', '+Math.round(fraction(by.stomach)*100)+'% stored';
    else if(id==='jazari-peacock')d.readingLabel=s.mode?'Bowl draining':'Serving until bowl fills';
    else if(id==='moniac')d.readingLabel='Treasury '+Math.round(fraction(by.t0)*100)+'%, household '+Math.round(fraction(by.t2)*100)+'%';
    else if(id==='lukyanov-integrator')d.readingLabel='Layer temperatures represented by water levels';
    else if(id==='marly-machine')d.readingLabel=(s.running?'River wheel turning':'Wheel stopped')+', upper '+Math.round(fraction(by.upper)*100)+'%';
    else if(id==='parts-budget-puzzles')d.readingLabel=(completed?'Receiver filled. ': 'Reach the receiver. ')+'Parts '+s.budget+' left';
    else if(id==='pneumatica-campaign')d.readingLabel=completed?'Campaign complete':'Stage '+(Math.min(3,s.stage)+1)+' of 4';
    else if(id==='garden-automation')d.readingLabel=(s.running?'Moisture control on':'Moisture control off')+', '+n.slice(1).map(function(a){return Math.round(fraction(a)*100)+'%';}).join(' / ');
    else if(id==='fire-brigade')d.readingLabel=(s.running?'Hose flowing':'Hose stopped')+', fires '+s.heat.filter(function(h){return h>.05;}).length;
    else if(id==='water-chain-reaction')d.readingLabel=(completed?'Goal filled. ':'')+'Automatic gates '+(byEdge.trigger1.open?'1':'0')+' / '+(byEdge.trigger2.open?'1':'0');
    else d.readingLabel='Water network';
  }
  function activate(id){
    var name=d.name;
    if(id==='primary'){
      if(name==='binary-staircase'){var dose=2500,admitted=move(by.supply,by.b0,dose);s.energy+=admitted*250*140;for(var bit=0;bit<3;bit++){var bucket=by['b'+bit];if(bucket.volume<dose*2-1)break;var next=bit<2?by['b'+(bit+1)]:by.supply;move(bucket,next,dose);move(bucket,by.supply,dose);events++;}events++;}
      else if(name==='bramah-press'){s.pressTime=1.2;events++;}
      else if(name==='hero-vending'){s.coin=.001;s.coinVelocity=0;byEdge['coin-valve'].open=false;events++;}
      else if(name==='bottle-glass-pitch'){byEdge.fill.open=!byEdge.fill.open;byEdge['glass-fill'].open=byEdge.fill.open;events++;}
      else if(name==='fountain-music'){var next=e.some(function(x){return /^note/.test(x.id)&&!x.open;});e.forEach(function(x){if(/^note/.test(x.id))x.open=next;});ensureMusic();events++;}
      else if(name==='mariotte-bottle'){byEdge.outlet.open=!byEdge.outlet.open;events++;}
      else if(name==='moniac'){byEdge.spend.bore=byEdge.spend.bore===6?10:6;events++;}
      else if(name==='lukyanov-integrator'){var pulse=Math.min(by.t0.capacity-by.t0.volume,by.t0.capacity*.12);by.t0.volume+=pulse;added+=pulse;s.energy+=pulse*180;events++;}
      else if(name==='hero-drinking-animal'){s.pressed=!s.pressed;events++;}
      else if(name==='banu-musa-fountain'){s.mode=1-s.mode;events++;}
      else if(name==='parts-budget-puzzles'){if(s.budget>0&&!byEdge.part0.open){byEdge.part0.open=true;s.budget--;events++;}}
      else if(name==='pneumatica-campaign'){if(!byEdge.gate0.open){byEdge.gate0.open=true;s.stage=1;events++;}}
      else if(name==='water-chain-reaction'){byEdge.trigger0.open=!byEdge.trigger0.open;events++;}
      else {s.running=!s.running;if(name==='vacuum-siphon')s.prime=s.running;events++;}
    }else if(id==='air-tube'){byEdge.outlet.intake=byEdge.outlet.intake===.46?.25:.46;events++;}
    else if(id==='vent'){s.mode=1-s.mode;events++;}
    else if(id==='drain'){byEdge.fill.open=false;byEdge['glass-fill'].open=false;move(by.bottle,by.supply,Math.min(by.bottle.volume,by.bottle.capacity*.15));move(by.glass,by.supply,Math.min(by.glass.volume,by.glass.capacity*.30));events++;}
    else if(id==='glass-fill'){byEdge['glass-fill'].open=!byEdge['glass-fill'].open;events++;}
    else if(id==='glass-drain'){byEdge['glass-fill'].open=false;move(by.glass,by.supply,Math.min(by.glass.volume,by.glass.capacity*.30));events++;}
    else if(/^note[0-3]$/.test(id)){byEdge[id].open=!byEdge[id].open;ensureMusic();events++;}
    else if(id==='tap'){tapResonator(bottleFrequency());s.lastTap=t;events++;}
    else if(id==='glass-tap'){tapResonator(glassFrequency());s.lastGlassTap=t;events++;}
    else if(id==='air'){s.mode=1-s.mode;if(s.mode)s.prime=false;events++;}
    else if(id==='scale'){s.mode=1-s.mode;events++;}
    else if(id==='load'){s.mode=1-s.mode;events++;}
    else if(id==='reset'){s.coin=0;byEdge['coin-valve'].open=false;events++;}
    else if(id==='release'){s.pressed=false;events++;}
    else if(id==='tax-control'){byEdge.tax.bore=byEdge.tax.bore===5?9:5;events++;}
    else if(id==='save-control'){byEdge.saving.bore=byEdge.saving.bore===4?8:4;events++;}
    else if(id==='resistance'){e.filter(function(v){return v.conductance;}).forEach(function(v){v.conductance=v.conductance===2.2?.8:2.2;});events++;}
    else if(id==='coupling'){byEdge.coupling.open=!byEdge.coupling.open;events++;}
    else if(/^part[12]$/.test(id)){var cost=id==='part2'?2:1;if(s.budget>=cost&&!byEdge[id].open){byEdge[id].open=true;s.budget-=cost;events++;}}
    else if(/^gate[12]$/.test(id)){var gateNumber=Number(id.slice(-1)),previous=gateNumber===1?by.one:by.two,required=gateNumber===1?.40:.25;if(fraction(previous)>=required&&!byEdge[id].open){byEdge[id].open=true;s.stage=gateNumber+1;events++;}}
    else if(id==='sensor'){s.mode=1-s.mode;events++;}
    else if(/^hose[0-2]$/.test(id)){s.mode=Number(id.slice(-1));events++;}
    setMessage();return true;
  }
  function simulate(dt){
    var id=d.name;
    if(id==='cup-synchronization'||id==='intermittent-fountain')e.forEach(function(x){if(x.pump)x.open=s.running&&(id!=='intermittent-fountain'||!byEdge.flush.primed);});
    if(id==='banu-musa-fountain'){byEdge.routeL.open=!s.mode;byEdge.routeR.open=!!s.mode;['left','right'].forEach(function(side,i){if(fraction(by[side])<.40)s.floatArmed[i]=true;});var active=s.mode;if(s.autoSwitch&&s.floatArmed[active]&&fraction(by[active?'right':'left'])>.45){s.mode=1-active;s.floatArmed[active]=false;s.switches++;events++;}}
    if(id==='mariotte-bottle'){var b=by.bottle,out=byEdge.outlet;var air=Math.max(.06,1-fraction(b));b.pressure=s.mode?0:fraction(b)>out.intake?250*(H(b)-H(by.receiver)-b.volume/b.rect.width+out.intake*b.rect.height):120*(.08/air-1);out.mariotte=!s.mode;}
    if(id==='galileo-well'){var lift=byEdge.lift;lift.open=s.running;lift.pump=250-(s.mode?30.48:9.14)*20;}
    if(id==='vacuum-siphon'){byEdge.siphon.open=s.prime&&!s.mode;}
    if(id==='bramah-press'){var press=byEdge.hydraulic;press.open=s.pressTime>0;press.pump=press.open?120:0;by.large.pressure=s.mode?250*140:250*20;s.pressTime=Math.max(0,(s.pressTime||0)-dt);}
    if(id==='hero-vending'){
      if(s.coin>0&&s.coin<1){s.coinVelocity+=3.2*dt;s.coin=Math.min(1,s.coin+s.coinVelocity*dt);}
      var coinTorque=s.coin>=1?.0235:0;
      s.leverVelocity+=(coinTorque-.04*s.leverAngle-.012*s.leverVelocity)/.003*dt;
      s.leverAngle=Math.max(0,Math.min(.8,s.leverAngle+s.leverVelocity*dt));
      if(s.leverAngle===0&&s.leverVelocity<0||s.leverAngle===.8&&s.leverVelocity>0)s.leverVelocity=0;
      byEdge['coin-valve'].open=s.leverAngle>.25;
    }
    if(id==='hero-drinking-animal')byEdge.straw.open=s.pressed;
    if(id==='jazari-peacock'){if(fraction(by.bowl)>.72)s.mode=1;if(fraction(by.bowl)<.12)s.mode=0;byEdge.serve.open=s.running&&!s.mode;byEdge.empty.open=s.running&&!!s.mode;}
    if(id==='marly-machine'){byEdge.wheel.open=s.running;byEdge.pump.open=s.running&&by.river.volume>by.river.capacity*.06;}
    if(id==='pneumatica-campaign'){s.readyGate1=fraction(by.one)>=.40;s.readyGate2=fraction(by.two)>=.25;}
    if(id==='garden-automation')e.forEach(function(x){if(/^irrigate/.test(x.id))x.open=s.running&&fraction(by[x.b])<(s.mode?.65:.45);});
    if(id==='water-chain-reaction'){byEdge.trigger1.open=fraction(by.stage0)>.08;byEdge.trigger2.open=fraction(by.stage1)>.08;}
    if(id==='fire-brigade')e.forEach(function(x){if(/^hose/.test(x.id))x.open=s.running&&x.id==='hose'+s.mode&&s.heat[Number(x.id.slice(-1))]>.001;});
    e.forEach(function(x){
      var a=by[x.a],b=by[x.b];x.flow=0;if(!x.open)return;
      if(x.siphon){if(!x.primed&&fraction(a)>x.crest){x.primed=true;if(id==='cup-synchronization'){var side=x.id==='drainL'?0:1;s.lastFlush[side]=t+dt;s.flushes[side]++;}}if(x.primed&&fraction(a)<x.reset)x.primed=false;if(!x.primed)return;}
      if(x.threshold && fraction(a)<x.threshold)return;
      var head=nodeHead(a)-nodeHead(b)+(x.pump||0);
      if(x.mariotte&&fraction(a)>x.intake)head=Math.max(0,H(b)-(a.rect.y+(1-x.intake)*a.rect.height));
      if(x.vaporLimit&&head>280)return;
      var flow=x.conductance?x.conductance*head:x.bore*.45*Math.sign(head)*Math.sqrt(2*250*Math.abs(head));
      if(x.check&&flow<0)flow=0;
      var requested=flow*dt;
      if(x.wheelDriven)requested=Math.min(Math.max(0,requested),Math.max(0,byEdge.wheel.flow)*dt*Math.max(0,nodeHead(by.river)-nodeHead(by.tail))*.58/Math.max(1,x.pump));
      var moved=requested>=0?move(a,b,requested):move(b,a,-requested);x.flow=(requested>=0?1:-1)*moved/dt;
      if(x.id==='wheel'&&moved>0){s.energy+=moved*Math.max(0,nodeHead(by.river)-nodeHead(by.tail))*250;}
      if(x.pump&&moved>0&&!x.wheelDriven){energy+=moved*x.pump*250;s.energy+=moved*x.pump*250;}
    });
    if(id==='marly-machine'){var tail=by.tail,drained=Math.min(tail.volume,dt*1000);tail.volume-=drained;removed+=drained;var river=by.river,received=Math.min(river.capacity-river.volume,dt*1000);river.volume+=received;added+=received;}
    if(id==='fire-brigade')for(var k=0;k<3;k++){var fire=by['fire'+k],v=Math.min(fire.volume,dt*300,s.heat[k]*800);fire.volume-=v;removed+=v;s.heat[k]=Math.max(0,s.heat[k]-v/800);}
    if(id==='garden-automation')for(k=0;k<3;k++){var soil=by['soil'+k],uptake=Math.min(soil.volume,dt*5);soil.volume-=uptake;removed+=uptake;}
    if(id==='parts-budget-puzzles'&&fraction(by.receiver)>.5)completed=true;
    if(id==='pneumatica-campaign'&&fraction(by.goal)>.20)completed=true;
    if(id==='fire-brigade'&&s.heat.every(function(h){return h<=.001;}))completed=true;
    if(id==='water-chain-reaction'&&fraction(by.stage2)>.30)completed=true;
  }
  function tick(dt){if(!(dt>0))return;var scale=c.timeScale?Math.max(.05,Math.min(4,c.timeScale())):1,left=Math.min(.2,dt*scale);while(left>1e-8){var h=Math.min(1/120,left);simulate(h);left-=h;t+=h;}setMessage();updateMusic();}
  function stats(){var current=n.reduce(function(v,a){return v+a.volume;},0);return{model:'finite hydraulic network',scene:d.name,time:t,initial:initial,water:current,added:added,removed:removed,massError:current+removed-initial-added,finite:n.every(function(a){return Number.isFinite(a.volume)&&a.volume>=-1e-5&&a.volume<=a.capacity+1e-5;})&&(d.name!=='hero-vending'||Number.isFinite(s.coin+s.leverAngle+s.leverVelocity)),nodes:n.map(function(a){return{id:a.id,volume:a.volume,capacity:a.capacity,fill:fraction(a),head:nodeHead(a)};}),edges:e.map(function(x){return{id:x.id,flow:x.flow,open:x.open,primed:x.primed||false};}),events:events,completed:completed,energyInput:s.energy,heat:s.heat.slice(),mode:s.mode,floatSwitches:s.switches||0,coin:s.coin,leverAngle:s.leverAngle||0,flushes:s.flushes?s.flushes.slice():null,lastFlush:s.lastFlush?s.lastFlush.slice():null,pitchHz:d.name==='bottle-glass-pitch'?{bottle:bottleFrequency(),glass:glassFrequency()}:null,soundEvents:s.soundEvents||0,audioState:audio?audio.state:'closed'};}
  function draw(ctx){ctx.save();var css=getComputedStyle(document.documentElement),water=css.getPropertyValue('--toy-water').trim()||'#8fb3c7',ink=css.getPropertyValue('--text').trim()||'#e8e2d6',gold=css.getPropertyValue('--accent').trim()||'#d4c4a0';
    if(d.name==='bramah-press'){
      ctx.strokeStyle=ink;ctx.globalAlpha=.5;ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(247,323);ctx.lineTo(400,323);ctx.stroke();ctx.globalAlpha=1;
      if(byEdge.hydraulic.open&&byEdge.hydraulic.flow>1){ctx.strokeStyle=water;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(247,323);ctx.lineTo(400,323);ctx.stroke();}
      ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.beginPath();ctx.arc(324,323,10,0,Math.PI*2);ctx.moveTo(324,313);ctx.lineTo(338,306);ctx.stroke();
    }else if(d.name==='bottle-glass-pitch'){
      ctx.strokeStyle=ink;ctx.globalAlpha=.42;ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(244,300);ctx.lineTo(300,300);ctx.moveTo(244,333);ctx.lineTo(270,333);ctx.lineTo(270,385);ctx.lineTo(505,385);ctx.lineTo(505,315);ctx.lineTo(525,315);ctx.stroke();
      if(byEdge.fill.flow>1){ctx.strokeStyle=water;ctx.globalAlpha=.82;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(244,300);ctx.lineTo(300,300);ctx.stroke();}
      if(byEdge['glass-fill'].flow>1){ctx.strokeStyle=water;ctx.globalAlpha=.82;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(244,333);ctx.lineTo(270,333);ctx.lineTo(270,385);ctx.lineTo(505,385);ctx.lineTo(505,315);ctx.lineTo(525,315);ctx.stroke();}ctx.globalAlpha=1;
    }else if(d.name==='cup-synchronization'){
      var joined=byEdge.coupling.open;
      ctx.strokeStyle=ink;ctx.globalAlpha=.55;ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(240,260);ctx.lineTo(480,260);ctx.stroke();
      ctx.strokeStyle=water;ctx.globalAlpha=joined?.82:.18;ctx.lineWidth=5;ctx.setLineDash(joined?[]:[7,7]);ctx.beginPath();ctx.moveTo(240,260);ctx.lineTo(480,260);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
      ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.beginPath();ctx.arc(360,260,12,0,Math.PI*2);ctx.moveTo(360,joined?248:247);ctx.lineTo(joined?374:360,joined?237:273);ctx.stroke();
      [['left','drainL','feedL',175,260],['right','drainR','feedR',545,460]].forEach(function(parts){var cup=by[parts[0]],drain=byEdge[parts[1]],feed=byEdge[parts[2]],x=parts[3],outside=parts[4],a=cup.rect,crest=a.y+a.height-4-a.height*.58;
        ctx.strokeStyle=ink;ctx.globalAlpha=.5;ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(a.x+5,crest);ctx.lineTo(a.x+a.width-5,crest);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
        ctx.strokeStyle=ink;ctx.globalAlpha=.55;ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(x,a.y+a.height-38);ctx.lineTo(x,a.y+29);ctx.quadraticCurveTo((x+outside)/2,a.y+8,outside,a.y+29);ctx.lineTo(outside,318);ctx.stroke();
        if(drain.primed&&drain.flow>1){ctx.strokeStyle=water;ctx.globalAlpha=.9;ctx.lineWidth=5;ctx.stroke();}ctx.globalAlpha=1;
        ctx.strokeStyle=ink;ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(x,312);ctx.lineTo(x,282);ctx.stroke();if(feed.flow>1){ctx.strokeStyle=water;ctx.lineWidth=4;ctx.stroke();}
      });
      ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.beginPath();ctx.arc(360,338,18,0,Math.PI*2);ctx.stroke();ctx.save();ctx.translate(360,338);ctx.rotate(s.running?t*3:0);for(var spoke=0;spoke<4;spoke++){ctx.rotate(Math.PI/2);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(15,0);ctx.stroke();}ctx.restore();
    }else if(d.name==='water-chain-reaction'){
      e.forEach(function(link,i){var a=by[link.a].rect,b=by[link.b].rect,x0=a.x+a.width,x1=b.x,y=Math.min(a.y+a.height-54,b.y+b.height-54),gate=(x0+x1)/2;
        ctx.strokeStyle=ink;ctx.globalAlpha=.48;ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();
        ctx.strokeStyle=water;ctx.globalAlpha=link.open?.85:.18;ctx.lineWidth=5;ctx.setLineDash(link.open?[]:[4,6]);ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
        ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(gate,y-15);ctx.lineTo(gate,y+15);ctx.stroke();
        ctx.strokeStyle=link.open?water:ink;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(gate-9,y+(link.open?-13:0));ctx.lineTo(gate+9,y+(link.open?13:0));ctx.stroke();
        if(i>0){var prior=by[link.a],r=prior.rect,surface=r.y+r.height-4-prior.volume/r.width,threshold=r.y+r.height-4-r.height*.08,fx=r.x+r.width-20;
          ctx.strokeStyle=ink;ctx.globalAlpha=.5;ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(r.x+5,threshold);ctx.lineTo(r.x+r.width-5,threshold);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
          ctx.fillStyle=water;ctx.beginPath();ctx.arc(fx,Math.max(r.y+8,Math.min(r.y+r.height-8,surface)),7,0,Math.PI*2);ctx.fill();
          ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(fx,surface);ctx.lineTo(fx,y-20);ctx.lineTo(gate,y-20);ctx.stroke();
        }
      });
    }else if(d.name==='banu-musa-fountain'){
      ctx.strokeStyle=ink;ctx.globalAlpha=.48;ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(244,300);ctx.lineTo(252,300);ctx.lineTo(252,145);ctx.lineTo(450,145);ctx.lineTo(450,165);ctx.moveTo(450,165);ctx.lineTo(336,165);ctx.lineTo(336,180);ctx.moveTo(450,165);ctx.lineTo(554,165);ctx.lineTo(554,180);ctx.moveTo(402,336);ctx.lineTo(488,336);ctx.stroke();
      ctx.strokeStyle=water;ctx.globalAlpha=.9;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(244,300);ctx.lineTo(252,300);ctx.lineTo(252,145);ctx.lineTo(450,145);ctx.lineTo(450,165);ctx.lineTo(s.mode?554:336,165);ctx.lineTo(s.mode?554:336,180);ctx.stroke();
      ctx.strokeStyle=gold;ctx.globalAlpha=1;ctx.lineWidth=2;ctx.beginPath();ctx.arc(450,165,10,0,Math.PI*2);ctx.moveTo(450,165);ctx.lineTo(s.mode?460:440,158);ctx.stroke();
    }else if(d.name==='hero-drinking-animal'){
      var straw=byEdge.straw,flowing=straw.open&&straw.flow>5;
      ctx.strokeStyle=ink;ctx.globalAlpha=.55;ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(252,300);ctx.lineTo(340,300);ctx.quadraticCurveTo(359,300,359,278);ctx.lineTo(359,246);ctx.quadraticCurveTo(359,231,378,231);ctx.lineTo(414,231);ctx.stroke();
      ctx.strokeStyle=water;ctx.globalAlpha=flowing?.92:.3;ctx.lineWidth=6;ctx.stroke();ctx.globalAlpha=1;
      ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(376,225);ctx.lineTo(376,237);ctx.moveTo(383,225);ctx.lineTo(383,237);ctx.stroke();
    }else e.forEach(function(link){var a=by[link.a].rect,b=by[link.b].rect,ax=a.x+a.width*.5,ay=a.y+a.height*.5,bx=b.x+b.width*.5,byy=b.y+b.height*.5;
      ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,byy);ctx.lineWidth=Math.max(3,Math.min(8,link.bore*.7));ctx.strokeStyle=link.open?water:ink;ctx.globalAlpha=link.open?.62:.25;ctx.setLineDash(link.open?[]:[5,5]);ctx.stroke();ctx.setLineDash([]);
      if(Math.abs(link.flow)>5){var dx=bx-ax,dy=byy-ay,len=Math.hypot(dx,dy)||1,sign=Math.sign(link.flow),mx=(ax+bx)*.5,my=(ay+byy)*.5;ctx.beginPath();ctx.moveTo(mx+sign*dx/len*10,my+sign*dy/len*10);ctx.lineTo(mx-sign*dx/len*5-dy/len*5,my-sign*dy/len*5+dx/len*5);ctx.lineTo(mx-sign*dx/len*5+dy/len*5,my-sign*dy/len*5-dx/len*5);ctx.closePath();ctx.fillStyle=water;ctx.globalAlpha=.95;ctx.fill();}
    });
    if(d.name==='bottle-glass-pitch'){
      var supply=by.supply,bottle=by.bottle,glass=by.glass;
      ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(60,364);ctx.lineTo(60,154);ctx.moveTo(245,154);ctx.lineTo(245,364);ctx.lineTo(60,364);ctx.stroke();
      ctx.fillStyle=water;ctx.globalAlpha=.68;ctx.fillRect(63,364-198*fraction(supply),179,198*fraction(supply));ctx.globalAlpha=1;
      function bottleSkin(){ctx.beginPath();ctx.moveTo(360,104);ctx.lineTo(410,104);ctx.lineTo(410,153);ctx.quadraticCurveTo(470,169,470,202);ctx.lineTo(470,362);ctx.quadraticCurveTo(385,376,300,362);ctx.lineTo(300,202);ctx.quadraticCurveTo(300,169,360,153);ctx.closePath();}
      bottleSkin();ctx.save();ctx.clip();ctx.fillStyle=water;ctx.globalAlpha=.65;ctx.fillRect(300,364-248*fraction(bottle),170,248*fraction(bottle));ctx.restore();ctx.strokeStyle=ink;ctx.lineWidth=3;bottleSkin();ctx.stroke();
      function glassSkin(){ctx.beginPath();ctx.moveTo(525,214);ctx.lineTo(635,214);ctx.lineTo(621,364);ctx.lineTo(539,364);ctx.closePath();}
      glassSkin();ctx.save();ctx.clip();ctx.fillStyle=water;ctx.globalAlpha=.65;ctx.fillRect(525,364-138*fraction(glass),110,138*fraction(glass));ctx.restore();ctx.strokeStyle=ink;ctx.lineWidth=3;glassSkin();ctx.stroke();
      ctx.fillStyle=ink;ctx.textAlign='center';ctx.font='12px "Commit Mono", monospace';ctx.fillText('Finite water',153,145);ctx.fillText('Blown bottle',385,91);ctx.fillText('Tapped glass',580,201);
      ctx.font='11px "Commit Mono", monospace';ctx.fillText(Math.round(bottleFrequency())+' Hz',385,332);ctx.fillText(Math.round(glassFrequency())+' Hz',580,348);
      for(var ring=0;ring<3;ring++){if(t-(s.lastTap||-1)>0&&t-s.lastTap<.4){ctx.beginPath();ctx.arc(385,130,12+ring*10,Math.PI,2*Math.PI);ctx.stroke();}if(t-(s.lastGlassTap||-1)>0&&t-s.lastGlassTap<.4){ctx.beginPath();ctx.arc(580,205,12+ring*10,Math.PI,2*Math.PI);ctx.stroke();}}
    }else if(d.name==='hero-drinking-animal'){
      var animal=by.stomach,bowl=by.bowl,bodyLevel=355-(animal.volume/animal.capacity)*188,bowlHeight=Math.min(bowl.rect.height-8,bowl.volume/bowl.rect.width);
      ctx.fillStyle=water;ctx.globalAlpha=.70;ctx.fillRect(bowl.rect.x+4,bowl.rect.y+bowl.rect.height-4-bowlHeight,bowl.rect.width-8,bowlHeight);ctx.globalAlpha=1;
      function animalShape(){ctx.beginPath();ctx.moveTo(416,231);ctx.quadraticCurveTo(386,215,395,193);ctx.quadraticCurveTo(402,176,438,181);ctx.quadraticCurveTo(461,145,515,151);ctx.quadraticCurveTo(553,139,594,165);ctx.quadraticCurveTo(628,179,631,222);ctx.lineTo(631,325);ctx.quadraticCurveTo(631,353,608,355);ctx.lineTo(438,355);ctx.quadraticCurveTo(422,353,422,332);ctx.lineTo(422,259);ctx.quadraticCurveTo(419,240,416,231);ctx.closePath();}
      ctx.save();animalShape();ctx.clip();ctx.fillStyle=water;ctx.globalAlpha=.68;ctx.fillRect(390,bodyLevel,250,355-bodyLevel);ctx.restore();
      ctx.strokeStyle=ink;ctx.globalAlpha=.8;ctx.lineWidth=2.5;animalShape();ctx.stroke();ctx.globalAlpha=1;
      ctx.fillStyle=gold;ctx.beginPath();ctx.arc(440,198,4,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(395,193);ctx.quadraticCurveTo(414,187,422,202);ctx.moveTo(414,231);ctx.quadraticCurveTo(417,237,426,240);ctx.stroke();
      ctx.font='11px "Commit Mono", monospace';ctx.textAlign='center';ctx.fillStyle=ink;ctx.fillText('Body reservoir',528,139);
      ctx.fillStyle=gold;ctx.fillText(s.pressed?'Muscle suction':'Mouth released',523,375);
    }else{ctx.globalAlpha=.70;ctx.fillStyle=water;n.forEach(function(a){var r=a.rect,h=Math.min(r.height-8,a.volume/r.width);if(h>0)ctx.fillRect(r.x+4,r.y+r.height-4-h,r.width-8,h);});ctx.globalAlpha=1;}
    function spout(a,flow,side){if(!(flow>8))return;var r=a.rect,x=r.x+r.width*.5,y=r.y+40,swing=side*44;ctx.strokeStyle=water;ctx.lineWidth=Math.max(2,Math.min(5,flow/180));ctx.globalAlpha=.80;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+swing*.55,r.y-90,x+swing,r.y+65);ctx.stroke();ctx.globalAlpha=1;}
    if(d.name==='fountain-music')for(var jet=0;jet<4;jet++)spout(by['jet'+jet],byEdge['note'+jet].flow,jet<2?-1:1);
    if(d.name==='banu-musa-fountain'){spout(by.left,byEdge.routeL.flow,-1);spout(by.right,byEdge.routeR.flow,1);['left','right'].forEach(function(side,i){var a=by[side],r=a.rect,surface=r.y+r.height-4-a.volume/r.width,line=r.y+r.height-4-(r.height-12)*.45,fx=r.x+r.width-17;ctx.strokeStyle=gold;ctx.globalAlpha=.65;ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(r.x+5,line);ctx.lineTo(r.x+r.width-5,line);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;ctx.fillStyle=gold;ctx.beginPath();ctx.arc(fx,surface,6,0,Math.PI*2);ctx.fill();ctx.strokeStyle=gold;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(fx,surface);ctx.lineTo(fx,r.y+18);ctx.stroke();});}
    if(d.name==='intermittent-fountain')spout(by.jet,byEdge.flush.flow,-1);
    if(d.name==='bramah-press'){ctx.fillStyle=ink;['small','large'].forEach(function(id){var a=by[id],r=a.rect,y=r.y+r.height-4-a.volume/r.width;ctx.fillRect(r.x+5,y-6,r.width-10,6);ctx.strokeStyle=ink;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(r.x+r.width/2,y-6);ctx.lineTo(r.x+r.width/2,y-62);ctx.stroke();});
      var sy=by.small.rect.y+by.small.rect.height-4-by.small.volume/by.small.rect.width,ly=by.large.rect.y+by.large.rect.height-4-by.large.volume/by.large.rect.width;
      ctx.fillRect(170,sy-66,49,7);ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.strokeRect(s.mode?460:470,ly-(s.mode?98:81),s.mode?100:80,s.mode?36:19);
      if(s.pressTime>0){ctx.fillStyle=water;ctx.beginPath();ctx.moveTo(194,sy-39);ctx.lineTo(187,sy-49);ctx.lineTo(201,sy-49);ctx.closePath();ctx.fill();}
      ctx.fillStyle=ink;ctx.font='11px "Commit Mono", monospace';ctx.textAlign='center';ctx.fillText(s.mode?'Heavy load':'Light load',510,ly-(s.mode?106:90));ctx.fillText('Area ratio 2.1:1',360,384);
    }
    if(d.name==='hero-vending'){
      var leverEnd=184+36*s.leverAngle;
      ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(316,184);ctx.lineTo(424,leverEnd);ctx.moveTo(424,leverEnd);ctx.lineTo(424,247);ctx.stroke();
      ctx.fillStyle=ink;ctx.beginPath();ctx.arc(316,184,5,0,Math.PI*2);ctx.fill();
      if(s.coin>0){ctx.beginPath();ctx.arc(350,96+Math.min(1,s.coin)*80,8,0,Math.PI*2);ctx.fill();}
    }
    if(d.name==='marly-machine'){var wheel=byEdge.wheel,angle=t*Math.min(8,Math.abs(wheel.flow)/110);ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.beginPath();ctx.arc(310,315,25,0,Math.PI*2);ctx.stroke();for(var k=0;k<6;k++){var theta=angle+k*Math.PI/3;ctx.beginPath();ctx.moveTo(310,315);ctx.lineTo(310+25*Math.cos(theta),315+25*Math.sin(theta));ctx.stroke();}}
    if(d.name==='fire-brigade'){for(var f=0;f<3;f++)if(s.heat[f]>.001){var fire=by['fire'+f].rect;ctx.fillStyle=ink;ctx.globalAlpha=.4+.6*s.heat[f];ctx.beginPath();ctx.arc(fire.x+fire.width*.5,fire.y+fire.height*.35,7+14*s.heat[f],0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}}
    ctx.font='13px "Commit Mono", monospace';ctx.textAlign='center';ctx.fillStyle=ink;ctx.fillText(d.readingLabel||'',360,15);ctx.restore();}
  setMessage();return{smoke:false,tick:tick,draw:draw,clock:function(){return t;},stats:stats,primary:function(){return activate('primary');},controls:function(){return[{id:'primary',label:d.action,x:d.name==='bottle-glass-pitch'?92:d.name==='bramah-press'?180:364,y:d.name==='bottle-glass-pitch'?28:46,width:130,height:36,kind:'runtime',pointerMode:'button',disabled:d.name==='parts-budget-puzzles'&&(s.budget<1||byEdge.part0.open)||d.name==='pneumatica-campaign'&&byEdge.gate0.open}].concat(controls.map(function(x){return{id:x.id,label:x.label,x:x.x,y:x.y,width:x.width,height:x.height,kind:'runtime',pointerMode:'button',disabled:d.name==='parts-budget-puzzles'&&(byEdge[x.id].open||s.budget<(x.id==='part2'?2:1))||d.name==='pneumatica-campaign'&&(byEdge[x.id].open||!(x.id==='gate1'?s.readyGate1:s.readyGate2))};}));},activate:function(id){return activate(id);},release:function(){},setActive:function(active){audioActive=!!active;if(audio){if(audioActive)audio.resume();else audio.suspend();}updateMusic();},destroy:function(){voices.forEach(function(v){v.oscillator.stop();});voices=[];if(audio)audio.close();audio=null;}};
}
var previous=root.WSSDraftRuntime;
root.WSSDraftRuntime={create:function(c){return c.definition.network?create(c):previous&&previous.create?previous.create(c):null;}};
ids.forEach(function(id){M[id]={make:function(w,o){return make(id,w,o||{});}};});
root.WSSNetworkMachines={ids:ids,model:model,make:make,create:create};
})(typeof window!=='undefined'?window:globalThis);
