/* First material and bubble apparatus drafts, using the existing native solvers. */
(function(root){
'use strict';
var factories={},entries=[];
function rect(x,y,w,h){return {x:x,y:y,width:w,height:h};}
function box(id,label,r,sealed){return {id:id,label:label,rect:r,sealed:!!sealed};}
function initial(r){return {kind:'rect',rect:r};}
function base(id,title,caption,world,options){
 if(world.w!==720||world.h!==400||world.tile!==8)throw Error('Material drafts need the 720 by 400 apparatus.');
 return {name:id,title:title,draft:true,seed:options.seed||17,action:'Stir once',primary:{kind:'material-jolt'},caption:'Draft. '+caption,
  readingLabel:'Draft apparatus',viewBounds:rect(64,24,624,368),vessels:[],pipes:[],solids:[],vents:[],parts:[],slimes:[],initial:[],marks:[],meters:[],settings:{enabled:false},boundaries:null,
  boundaryNote:'Draft apparatus. Every liquid and grain remains in the native MLS-MPM solver. No timed flow or hidden refill.',
  energyBudgetStatus:'Draft using the existing reduced native material or bubble model. Numerical contact and body-water work are not closed.'};
}
function pressure(){return {particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,geometricGas:true,nonlinearGas:true,vaporClosure:true,boundaryReconstruction:true,phaseChange:true,cellSize:8,soundSpeed:2500,iterations:32,redBlack:true,roomPressurePsi:14.7,minimumPressure:-80000};}
function slip(density){return {density:density||[1,.7733,2.65],drag:[4,4,4]};}
function register(id,capability,title,cue,status,make,deps){
 factories[id]=make;entries.push({id:id,capability:capability,title:title,cue:cue,status:status,draft:true,world:{w:720,h:400},pool:false,dependencies:deps||[]});
 root.WSSMachines=root.WSSMachines||{};root.WSSMachines[id]={make:function(w,o){return make(w,o||{});}};
}
register('material-sand-jar','Sand','Settling and sorting jar','Stir the grains through the water.','PARTLY',function(w,o){
 var d=base('material-sand-jar','Settling and sorting jar','Grains settle through still water; sorting is not working yet.',w,o),jar=rect(248,56,224,320);
 d.viewBounds=rect(208,0,304,400);d.vessels=[box('jar','Grains in water',jar)];d.initial=[initial(rect(256,120,208,248))];
 d.materialSlip=slip();d.materialAt=function(x,y){return y>=132&&y<232&&Math.floor((x-256)/1.25)%4===0&&Math.floor((y-120)/1.25)%4===0?'sand':'water';};d.measure={source:jar,receiver:jar};return d;
});
register('hourglass','Sand','Hourglass','Watch the sand find the narrow neck.','PARTLY',function(w,o){
 var d=base('hourglass','Hourglass','Sand falls through a narrow neck; shake once if a bridge forms.',w,o),jar=rect(232,40,256,336);
 d.viewBounds=rect(192,16,336,376);d.vessels=[box('glass','Hourglass',jar,true)];
 for(var y=104;y<240;y+=8){var gap=Math.max(16,Math.ceil((240-y)*.65/8)*16);d.solids.push(rect(240,y,(240-gap)/2,8),rect(360+gap/2,y,(240-gap)/2,8));}
 d.initial=[initial(rect(256,64,208,104))];d.materialSlip=slip();d.materialAt=function(){return 'sand';};d.measure={source:rect(240,48,240,184),receiver:rect(240,240,240,128)};return d;
});
register('aquarium-bubbler','Bubbles','Aquarium bubbler','Stop the air and watch the last bubbles rise.','PARTLY',function(w,o){
 var d=base('aquarium-bubbler','Aquarium bubbler','The declared air pump sends real gas parcels through the water.',w,o),tank=rect(112,96,496,288);
 d.vessels=[box('tank','Aquarium',tank)];d.initial=[initial(rect(120,256,480,120))];d.settings=pressure();d.primary={kind:'bubble-toggle'};d.action=o.inject===false?'Start the air':'Stop the air';
 d.bubbles={inject:o.inject!==false,hose:{x:360,y:352},rateArea:195,parcelArea:65,dragCoefficient:1,gravity:250};d.measure={source:tank,receiver:tank};
 d.boundaryNote='Draft. The marked air supply adds gas, never water. Existing quasi-static gas parcels displace native water and release their gas at the surface.';return d;
},['wss-bubbles']);
register('air-lift-pump','Bubbles','Air-lift pump','Send bubbles up the riser toward the receiving cup.','PARTLY',function(w,o){
 var d=base('air-lift-pump','Air-lift pump','Bubbles enter a submerged riser; lifting water into the cup is still a draft.',w,o),source=rect(160,144,240,240),receiver=rect(504,280,176,104);
 d.vessels=[box('source','Supply water',source),box('receiver','Receiving cup',receiver)];d.pipes=[{points:[{x:384,y:336},{x:440,y:336},{x:440,y:112},{x:560,y:112}],bore:32}];
 d.initial=[initial(rect(168,232,224,144)),initial(rect(432,240,16,96))];d.settings=pressure();d.primary={kind:'bubble-toggle'};d.action=o.inject===false?'Start the air':'Stop the air';
 d.bubbles={inject:o.inject!==false,hose:{x:440,y:320},rateArea:195,parcelArea:65,dragCoefficient:1,gravity:250};d.measure={source:source,receiver:receiver};return d;
},['wss-bubbles']);
register('sand-dam','Sand','Sand dam','Pour water against the loose grain barrier.','PARTLY',function(w,o){
 var d=base('sand-dam','Sand dam','Water meets a loose sand barrier; watch for seepage or washed-out grains.',w,o),source=rect(64,80,232,304),channel=rect(280,248,384,136);
 d.vessels=[box('source','Water',source),box('channel','Sand barrier',channel)];d.pipes=[{points:[{x:280,y:336},{x:320,y:336}],bore:64}];
 d.initial=[initial(rect(72,184,216,192)),initial(rect(288,336,368,40)),initial(rect(336,272,48,104))];d.materialSlip=slip();
 d.materialAt=function(x,y){return x>=336&&x<384&&y>=272?'sand':'water';};d.primary={kind:'pour',target:{x:176,y:112}};d.action='Pour more water';d.measure={source:source,receiver:channel};return d;
});
register('gold-sluice-box','Sand','Gold sluice box','Pour water through the riffled channel.','PARTLY',function(w,o){
 var d=base('gold-sluice-box','Gold sluice box','Dense grain proxies meet real riffles; sorting gold from sand is not implemented.',w,o),source=rect(64,64,160,320),channel=rect(216,240,456,144);
 d.vessels=[box('source','Water and dense grains',source),box('channel','Riffles',channel)];d.pipes=[{points:[{x:208,y:304},{x:240,y:304}],bore:64}];
 for(var x=224;x<664;x+=8){var floor=Math.floor((344+(x-224)*32/440)/8)*8;d.solids.push(rect(x,floor,8,384-floor));if((x-272)%72===0)d.solids.push(rect(x,floor-16,8,16));}
 d.initial=[initial(rect(72,112,144,264)),initial(rect(224,312,440,48))];d.materialSlip=slip([1,.7733,19.3]);d.materialAt=function(x,y){return x>=128&&x<208&&y>=120&&y<176?'sand':'water';};
 d.primary={kind:'pour',target:{x:160,y:88}};d.action='Pour water';d.measure={source:source,receiver:channel};return d;
});
register('hero-jug','Oil','Hero\'s wine-or-water jug','Switch the real outlet gates between two liquids.','PARTLY',function(w,o){
 var d=base('hero-jug','Hero\'s wine-or-water jug','A manual outlet selector chooses water or an oil proxy for wine; the air-vent mechanism is missing.',w,o),water=rect(128,64,192,184),oil=rect(400,64,192,184),cup=rect(288,312,144,72);
 d.vessels=[box('water','Water',water),box('oil','Oil proxy for wine',oil),box('cup','Receiving cup',cup)];d.pipes=[{points:[{x:288,y:224},{x:288,y:288},{x:360,y:288}],bore:32},{points:[{x:432,y:224},{x:432,y:288},{x:360,y:288}],bore:32}];
 d.parts=[{id:'water-gate',type:'valve',rect:rect(280,248,32,16),direction:'down',open:true,mass:1},{id:'oil-gate',type:'valve',rect:rect(424,248,32,16),direction:'down',open:false,mass:1}];
 d.initial=[initial(rect(136,112,176,128)),initial(rect(408,112,176,128))];d.materialSlip=slip();d.materialAt=function(x){return x>=400?'oil':'water';};
 d.materialsDraft='hero-jug';d.primary={kind:'draft-primary'};d.action='Choose oil';d.measure={source:water,receiver:cup};return d;
});
register('interlayer-slime','Oil','Slime between oil and water','Drop and grab a slime above the two liquids.','PARTLY',function(w,o){
 var d=base('interlayer-slime','Slime between oil and water','The liquids separate around a real slime; stable flotation at their interface is not working yet.',w,o),jar=rect(248,56,224,320);
 d.viewBounds=rect(208,0,304,400);d.vessels=[box('jar','Oil and water',jar)];d.initial=[initial(rect(256,144,208,224))];d.materialSlip=slip();d.materialAt=function(x,y){return y>=256?'oil':'water';};
 d.slimes=[{x:360,y:104,radius:24}];d.measure={source:jar,receiver:jar};return d;
});
var previousRuntime=root.WSSDraftRuntime;
root.WSSDraftRuntime={create:function(context){
 if(context.definition.materialsDraft!=='hero-jug')return previousRuntime&&previousRuntime.create?previousRuntime.create(context):null;
 var d=context.definition,oil=false;
 return {primary:function(){
  var setValve=context.setManualValve || (root.__toy&&root.__toy.valve);if(!setValve)return false;
  oil=!oil;d.parts.forEach(function(p){setValve(p.buildId,p.id==='oil-gate'?oil:!oil);});d.action=oil?'Choose water':'Choose oil';return true;
 },stats:function(){return {selected:oil?'oil':'water',blocker:'Manual outlet gates work; the historical vent-controlled mechanism is not implemented.'};},destroy:function(){}};
}};
root.WSSDraftsMaterials={entries:entries,dependencies:function(id){var e=entries.find(function(e){return e.id===id;});return ['wss-drafts-materials'].concat(e?e.dependencies:[]);},make:function(id,w,o){if(!factories[id])throw Error('Unknown material draft');return factories[id](w,o||{});}};
})(typeof window!=='undefined'?window:globalThis);
