/* Declarative apparatus geometry. All initial water is seeded into the
 * existing particle solver by the host. No flow, phase timer or animation
 * is part of these definitions. Dimensions are world pixels, snapped to walls.
 */
(function (root, factory) {
  'use strict';
  var api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.WaterMachinesScenes=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  'use strict';
  function make(name,world,options){
    options=options || {};
    var W=world.w,H=world.h,T=world.tile || 8;
    if(!(Number.isFinite(W) && Number.isFinite(H) && W>=300 && H>=320))throw new Error('Apparatus needs a world at least 300 by 320 pixels.');
    function snap(v){return Math.round(v/T)*T;}
    function center(v){return (Math.round(v/T-.5)+.5)*T;}
    function point(x,y){return {x:center(x),y:center(y)};}
    function probe(x,y){return {x:x,y:y};}
    function rect(x,y,w,h){return {x:snap(x),y:snap(y),width:snap(w),height:snap(h)};}
    function option(key,fallback){
      if(options[key]===undefined)return fallback;
      if(!Number.isFinite(options[key]))throw new Error('Apparatus '+key+' must be a finite world-pixel dimension.');
      return options[key];
    }
    function vesselOption(key,fallback){
      var shape=options[key];
      if(shape===undefined)return fallback;
      if(!shape || !['x','y','width','height'].every(function(k){return Number.isFinite(shape[k]);}))
        throw new Error('Apparatus '+key+' must contain four finite world-pixel dimensions.');
      var r=rect(shape.x,shape.y,shape.width,shape.height);
      if(r.x<T || r.y<T || r.width<T*6 || r.height<T*6 || r.x+r.width>W-T || r.y+r.height>H-T)
        throw new Error('Apparatus '+key+' must fit inside the world border with room for water.');
      return r;
    }
    var result={name:name,vessels:[],pipes:[],initial:[],slimes:[],meters:[],marks:[],parts:[],
      settings:{soundSpeed:500,atmospherePressure:100000,minimumPressure:-80000},seed:options.seed || 17};
    function vessel(id,shape,sealed){result.vessels.push({id:id,rect:shape,sealed:!!sealed});return shape;}
    function pipe(id,points,bore,primed){
      points=points.filter(function(p,i){return !i || p.x!==points[i-1].x || p.y!==points[i-1].y;});
      var p={id:id,points:points,bore:snap(bore || 24),primed:!!primed};result.pipes.push(p);
      if(primed)result.initial.push({kind:'pipe',points:points,bore:p.bore,tile:T});return p;
    }
    function fill(id,r,level){result.initial.push({kind:'rect',vessel:id,
      rect:{x:r.x+T,y:snap(level),width:r.width-2*T,height:r.y+r.height-T-snap(level)}});}
    if(name==='siphon'){
      result.title='Siphon';result.action=options.open===true ? 'Close valve' : 'Open valve';
      result.caption='The filled tube connects a higher tank to a lower one. Open the valve to test whether water keeps crossing the bend.';
      var stockW=Math.min(W,1120),stockH=Math.min(H,672);
      var source=vessel('source',vesselOption('source',rect(stockW*.08,stockH*.40,stockW*.34,stockH*.40)),false);
      var receiver=vessel('receiver',vesselOption('receiver',rect(stockW*.46,stockH*.58,stockW*.48,stockH*.37)),false);
      if(source.x<receiver.x+receiver.width && source.x+source.width>receiver.x &&
        source.y<receiver.y+receiver.height && source.y+source.height>receiver.y)
        throw new Error('Siphon source and receiver must leave separate storage volumes.');
      var bore=snap(option('bore',24));
      if(bore<T*2 || bore>T*4)throw new Error('Siphon bore must span two to four wall cells.');
      var boreCells=bore/T,negative=(Math.floor((boreCells-1)*.5)+.5)*T,
        positive=(boreCells-1-Math.floor((boreCells-1)*.5)+.5)*T;
      // The crest stays above the open rim. A horizontal tube inside the
      // source headspace would roof over one side and trap a second gas room.
      var defaultCrest=Math.min(Math.max(stockH*.23,stockH*.80-240),source.y-T*4.5);
      var sourceLevel=snap(option('sourceLevel',stockH*.48)),crest=center(option('crest',defaultCrest));
      var inlet=point(option('inletX',source.x+source.width*.65),source.y+source.height-T*2.5);
      var outlet=point(option('outletX',receiver.x+receiver.width*.4),option('outletHeight',stockH*.65));
      if(inlet.x-negative-T<source.x+T || inlet.x+positive+T>source.x+source.width-T)
        throw new Error('Siphon inletX must leave its pipe walls inside the source tank.');
      if(outlet.x-negative-T<receiver.x+T || outlet.x+positive+T>receiver.x+receiver.width-T)
        throw new Error('Siphon outletX must leave its pipe walls inside the receiver.');
      if(outlet.x-negative-T<source.x+source.width+T && outlet.x+positive+T>source.x-T)
        throw new Error('Siphon outletX must leave its leg and a room-air path outside the source tank.');
      if(sourceLevel<source.y+T || sourceLevel>inlet.y-negative-T*.5)throw new Error('Siphon sourceLevel must leave the intake submerged within the source tank.');
      if(crest<T*3.5 || crest>source.y-positive-T*2)throw new Error('Siphon crest must leave an open air path above the source rim.');
      if(outlet.y<crest+T*6 || outlet.y>receiver.y+receiver.height-T*2.5)throw new Error('Siphon outletHeight must leave a straight valve seat below the crest and clear the receiver floor.');
      var route=[inlet,point(inlet.x,crest),point(outlet.x,crest),outlet];
      var tube=pipe('siphon',route,bore,true);fill('source',source,sourceLevel);
      var sectionX=center((inlet.x+outlet.x)*.5);
      result.meters.push({id:'crest',a:probe(sectionX,crest-negative),b:probe(sectionX,crest+positive),axis:'x',positive:1});
      result.marks.push({id:'source-level',x:source.x,y:sourceLevel,width:source.width});
      // The outlet seat holds the source-connected primer during the user's
      // delay. An inlet seat lets the downstream column drain before opening.
      result.parts.push({type:'valve',id:'supply',rect:rect(outlet.x-negative,outlet.y-T*2.5,bore,T),direction:'down',open:options.open===true});
      result.primary={kind:'valve',id:'supply'};
      result.measure={source:source,receiver:receiver,crest:crest,outlet:probe(outlet.x,outlet.y+T*.5),bore:tube.bore,sourceLevel:sourceLevel};
    }else if(name==='cup'){
      result.settings.particlePressure=true;
      result.settings.projectedVelocity=true;
      result.settings.directGather=true;
      result.settings.collapseEmptyCells=true;
      result.settings.geometricGas=true;
      result.settings.boundaryReconstruction=true;
      result.settings.cellSize=8;
      result.settings.soundSpeed=2500;
      result.settings.iterations=128;
      result.title='Greedy cup';result.action='Drop the slime';
      result.caption='Below the line, the cup holds its water. Drop a slime in and its displaced water can start the drain.';
      var cupWidth=snap(Math.min(568,W*.60)),cupTop=snap(Math.min(144,H*.22));
      var cupBottom=snap(Math.min(H*.62,cupTop+T*35));
      var cupLeft=Math.min(W*.50-cupWidth*.5,W-cupWidth-T*15);
      var cup=vessel('cup',rect(cupLeft,cupTop,cupWidth,cupBottom-cupTop),false);
      var bore=snap(option('bore',16));
      if(bore<T || bore>T*4)throw new Error('Cup bore must span one to four wall cells.');
      var boreCells=bore/T,negative=(Math.floor((boreCells-1)*.5)+.5)*T,
        positive=(boreCells-1-Math.floor((boreCells-1)*.5)+.5)*T;
      var legX=center(cup.x+cup.width-T-positive),stemX=center(cup.x+cup.width+T*3.5);
      var bend=center(option('crest',cup.y+T*4.5));
      if(bend<T*3.5 || bend>cupBottom-T*7.5)throw new Error('Cup crest must fit below the world ceiling and above the intake bend.');
      // The upright shares the right vessel wall, so it cannot roof over an
      // isolated gas cap. Its horizontal intake avoids clearing that wall at
      // a downward pipe mouth. The descending leg stays outside the vessel.
      var mouth=point(legX-T*4,cupBottom-T*3.5);
      var outletFace=Math.min(Math.max(bend+T*27.5,cupBottom+T*14.5),snap(H-T*12));
      var cupOutlet=point(stemX,outletFace-T*.5);
      // A wide rising tube feeds a narrower straight drain. The smaller
      // outlet area lets the overflowing source fill the descending stem.
      var cupRoute=[mouth,point(legX,mouth.y),point(legX,bend),point(stemX,bend),cupOutlet];
      pipe('cup-drain',cupRoute,bore,false);
      var receiverTop=snap(cupBottom+T*4);
      var catchment=vessel('receiver',rect(T*2,receiverTop,snap(W-T*4),snap(H-T*2)-receiverTop),false);
      var line=bend+positive,level=snap(option('level',line));
      if(level<cup.y+T || level>mouth.y-bore*.5)throw new Error('Cup level must leave water within the vessel and the intake submerged.');
      fill('cup',cup,level);
      result.initial[result.initial.length-1].exclude=[{kind:'pipe',points:cupRoute.slice(2),bore:bore,tile:T}];
      // A perforated shelf keeps the soft body off the intake channel.
      // Water can pass through the slots and underneath a settled slime.
      var stemLeft=stemX-negative,stemRight=stemX+positive;
      var stemTop=bend+positive,stemFloor=cupOutlet.y+T*.5;
      result.solids=[];
      if(bore>T)result.solids.push(rect(stemLeft,stemTop,bore-T,stemFloor-stemTop));
      for(var grateX=cup.x+T;grateX+T*2<=legX-negative-T;grateX+=T*4)
        result.solids.push(rect(grateX,cupBottom-T*7,T*2,T));
      // Pipe mouths clear their corner tiles. The low wide intake shares
      // the cup floor, which must remain closed after that carving step.
      result.solids.push(rect(cup.x,cupBottom-T,cup.width,T));
      var leftSpace=legX-bore*.5-T-(cup.x+T);
      // Leave the whole body above the initial surface on small worlds too.
      var dropRadius=Math.min(88,leftSpace*.30,(level-T*3)*.5);
      result.slimes.push({x:cup.x+T+leftSpace*.5,y:dropRadius+T*2,radius:dropRadius,held:true});
      result.meters.push({id:'drain',a:probe(stemRight-T,cupOutlet.y-T),b:probe(stemRight,cupOutlet.y-T),axis:'y',positive:1});
      result.marks.push({id:'trigger',x:cup.x,y:line,width:cup.width});
      result.primary={kind:'slime',index:0};
      result.measure={source:cup,receiver:catchment,crest:bend,trigger:line,intake:mouth,
        intakeFloor:mouth.y+positive,outlet:probe(stemRight-T*.5,cupOutlet.y+T*.5),bore:bore,sourceLevel:level};
    }else if(name==='heron'){
      result.title="Heron's fountain";result.action='Pour into basin';
      result.caption='An open basin drains into a sealed receiving jar. Pour water into the basin to test whether the trapped air drives a jet from the source jar.';
      // Bound the finite apparatus independently of surplus world space. A
      // taller world must not silently request more than the particle budget.
      var apparatusW=Math.min(W,1120),apparatusH=Math.min(H,672),short=apparatusH<400;
      var basinTop=short ? T*12 : Math.max(T*14,snap(apparatusH*.30));
      var basinHeight=short ? T*8 : T*10;
      var middleWidth=snap(Math.max(T*9,apparatusW*.22)),middleRight=snap(apparatusW-T*4),middleTop=basinTop+T*4;
      var sourceHeightLimit=apparatusW<480 ? T*12 : (apparatusH<640 ? T*15 : T*16);
      var middleBottom=middleTop+(short ? (apparatusW<480 ? T*9 : T*10) : Math.max(T*10,Math.min(sourceHeightLimit,snap(apparatusH*.65)-middleTop)));
      var middle=vessel('middle',rect(middleRight-middleWidth,middleTop,middleWidth,middleBottom-middleTop),true);
      var bottomTop=short ? T*21 : Math.min(snap(apparatusH*.53),basinTop+T*15);
      var bottomWidth=snap(Math.min(Math.max(T*27,apparatusW*.48),middle.x-T*7));
      var defaultFloor=short ? T*37 : Math.min(snap(apparatusH-T),bottomTop+T*22,basinTop+middleTop+T*8);
      var bottomHeight=snap(option('bottomHeight',defaultFloor-bottomTop));
      if(bottomHeight<T*10 || bottomTop+bottomHeight>defaultFloor)throw new Error('Heron bottomHeight must leave a dry gas mouth and fit the receiving vessel.');
      var chamberFloor=bottomTop+bottomHeight;
      var bottom=vessel('bottom',rect(T*4,bottomTop,bottomWidth,bottomHeight),true);
      var gasGap=center((bottom.x+bottom.width+middle.x)*.5),basinWidth=snap(Math.max(T*10,apparatusW*.27));
      var basin=vessel('basin',rect(Math.min(apparatusW*.38,gasGap-basinWidth-T*2),basinTop,basinWidth,basinHeight),false);
      var drainX=center(bottom.x+T*2.5),drainMouth=point(basin.x+T*2.5,basin.y+basin.height-T*3.5);
      pipe('basin-drain',[drainMouth,point(drainX,drainMouth.y),point(drainX,chamberFloor-T*3.5),point(drainX+T*4,chamberFloor-T*3.5)],T*2,true);
      // Gas ports sit two cells below the lid, including the builder mouth
      // clearance. The dry link fits in the gap and crosses no water route.
      var gasBottom=point(bottom.x+bottom.width-T*2.5,bottom.y+T*2.5),gasMiddle=point(middle.x+T*2.5,middle.y+T*2.5);
      pipe('air-link',[gasBottom,point(gasGap,gasBottom.y),point(gasGap,gasMiddle.y),gasMiddle],T,false);
      var pickup=point(middle.x+middle.width-T*2.5,middle.y+middle.height-T*3.5);
      var nozzle=point(basin.x+basin.width-T*2.5,basin.y-T*4.5),nozzleTurn=center(basin.y-T*3.5);
      pipe('nozzle',[point(pickup.x-T*4,pickup.y),pickup,point(pickup.x,nozzleTurn),point(nozzle.x,nozzleTurn),nozzle],T*2,true);
      fill('middle',middle,middle.y+T*4);fill('bottom',bottom,chamberFloor-T*3);fill('basin',basin,basin.y+(short ? T*4 : T*3));
      result.meters.push({id:'nozzle',a:probe(nozzle.x-T*.5,nozzle.y+T),b:probe(nozzle.x+T*1.5,nozzle.y+T),axis:'y',positive:-1});
      // A horizontal drain starts to the left of its mouth. The valve sits
      // in that actual clear bore, well outside the open basin's water area.
      result.parts.push({type:'valve',id:'basin-supply',rect:rect(drainMouth.x-T*2.5,drainMouth.y-T*.5,T,T*2),direction:'left',open:options.open!==false});
      result.primary={kind:'pour',target:point(basin.x+basin.width*.25,basin.y+T)};
      result.measure={source:middle,basin:basin,bottom:bottom,nozzle:probe(nozzle.x,nozzle.y-T*.5),
        intake:point(pickup.x-T*4,pickup.y),intakeFloor:pickup.y+T*1.5,bore:T*2,bottomHeight:bottomHeight};
    }else throw new Error('Unknown water machine '+name);
    return result;
  }
  function distanceToSegment(x,y,a,b){
    var dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
    var t=len ? Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len)) : 0;
    return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
  }
  function contains(shape,x,y){
    if(shape.exclude && shape.exclude.some(function(s){return contains(s,x,y);}))return false;
    if(shape.kind==='rect'){var r=shape.rect;return x>=r.x && y>=r.y && x<r.x+r.width && y<r.y+r.height;}
    if(shape.kind==='pipe'){
      var tile=shape.tile || 8,cells=Math.ceil(shape.bore/tile),low=Math.floor((cells-1)*.5),high=cells-1-low;
      var negative=(low+.5)*tile-1.25,positive=(high+.5)*tile-1.25,cap=tile*.5;
      for(var i=1;i<shape.points.length;i++){
        var a=shape.points[i-1],b=shape.points[i];
        if(a.y===b.y && x>=Math.min(a.x,b.x)-cap && x<Math.max(a.x,b.x)+cap && y>=a.y-negative && y<a.y+positive)return true;
        if(a.x===b.x && y>=Math.min(a.y,b.y)-cap && y<Math.max(a.y,b.y)+cap && x>=a.x-negative && x<a.x+positive)return true;
      }
      // Filled miter squares match the builder's physical corners, preventing
      // decorative rounded initialization from leaving air in a primed bend.
      for(var j=1;j<shape.points.length-1;j++){
        var p=shape.points[j];if(x>=p.x-negative && x<p.x+positive && y>=p.y-negative && y<p.y+positive)return true;
      }
    }
    return false;
  }
  return {make:make,contains:contains,distanceToSegment:distanceToSegment};
});
