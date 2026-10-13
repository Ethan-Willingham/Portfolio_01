/* A dimensioned hand sluice and finite, classified quartz/magnetite/gold feed. */
(function(root){
'use strict';
function rect(x,y,w,h){return {x:x,y:y,width:w,height:h};}
function make(world,options){
 options=options||{};
 if(world.w!==1440||world.h!==584||world.tile!==8)throw Error('The sluice needs a 1440 by 584 world.');
 var unit=24,length=options.lengthInches===36?36:51;
 var slope=Number.isFinite(options.slope)?Math.max(4,Math.min(11,options.slope)):8.5;
 var height=Number.isFinite(options.riffleHeight)?Math.max(0,Math.min(12,options.riffleHeight)):6;
 var span=length*unit*Math.cos(slope*Math.PI/180),drop=length*unit*Math.sin(slope*Math.PI/180),end=72+span;
 var matched=options.matched===true,plain=options.riffles===false || height===0,solids=[],pockets=[],sections=[],polygons=[],seedPolygons=[];
 function floor(x){return 176+(x-72)*drop/span;}
 function slab(x0,x1,rise,depth){return [[x0,floor(x0)-rise],[x1,floor(x1)-rise],[x1,floor(x1)+depth],[x0,floor(x0)+depth]];}
 polygons.push(slab(72,end,0,8));seedPolygons.push(polygons[0]);
 for(var x=312;x<end-64;x+=96){
  var bar=slab(x,x+6,height,0);seedPolygons.push(bar);
  sections.push({x:Math.min(end-16,x+42),y:floor(Math.min(end-16,x+42))-7});
  if(!plain){polygons.push(bar);pockets.push(rect(x+6,floor(x+6)-height,80,height+10));}
 }
 // A common scale makes the longer hardware physically longer, including its
 // slope projection. Width is out of the page in this longitudinal section.
 solids.push(rect(64,68,8,116));
 var seed=(options.seed||17)>>>0;
 function batch(count,gold,black,salt){
  var state=(seed^salt)>>>0,items=Array(count).fill('sand');
  for(var i=0;i<gold;i++)items[i]='gold';for(i=gold;i<gold+black;i++)items[i]='black-sand';
  for(i=count-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;var j=Math.floor(state/4294967296*(i+1)),v=items[i];items[i]=items[j];items[j]=v;}
  return items;
 }
 var feedMaterials=batch(2400,6,192,0x91a45),initialMaterials=batch(192,1,15,0x738ba),initialGrains=[];
 if(options.initialCharge!==false)initialMaterials.forEach(function(material,i){
  var gx=208+(i%16)*2.1;initialGrains.push({material:material,x:gx,y:floor(gx)-3-Math.floor(i/16)*2.1});
 });
 // Separate receivers keep discarded tailings below the normal outlet. During
 // cleanout the riffles lift and an inserted chute carries the remaining wash
 // left into the concentrate pan. Its geometry does not touch either pan.
 var tank=rect(Math.round((end-140)/8)*8,480,208,88),collection=rect(Math.round((end-388)/8)*8,480,208,88);
 var chuteRight=end+66,chuteTop=floor(end)+18,chuteLeft=end-288,chuteBottom=468;
 var chute=[[chuteLeft,chuteBottom],[chuteRight,chuteTop],[chuteRight,chuteTop+8],[chuteLeft,chuteBottom+8]];
 var stop=[[chuteRight-6,chuteTop-48],[chuteRight+2,chuteTop-48],[chuteRight+2,chuteTop+8],[chuteRight-6,chuteTop+8]];
 var cleanoutParts=[chute,stop],cleanupPolygons=[polygons[0]].concat(cleanoutParts);
 return {name:'gold-sluice-box',title:'Gold sluice box',seed:seed,
  action:'Pour wash water',primary:{kind:'pour',target:{x:120,y:64}},
  setup:matched?'matched-density':plain?'no-riffles':'ordinary',caption:'Feed a little classified paydirt into the wash. Most of it is pale quartz. The darker grains are heavy black sand; gold is sparse. Watch the pockets before adding more.',
  readingLabel:'Quartz, black sand and gold',viewBounds:rect(48,28,end+112-48,548),
  vessels:[{id:'tailings',label:'Water and washed sediment',rect:tank,sealed:false},{id:'concentrate',label:'Concentrate pan',rect:collection,sealed:false}],
  pipes:[],solids:solids,vents:[],parts:[],slimes:[],marks:[],meters:[],
  initial:[{kind:'rect',rect:rect(72,120,128,56)},{kind:'rect',rect:rect(200,160,end-200,256)}],initialGrains:initialGrains,
  seedClear:function(x,y){
   if(x>=200 && (y<floor(x)-6 || y>=floor(x)-.75))return false;
   return seedPolygons.every(function(points){
    var inside=true,nearest=Infinity;
    points.forEach(function(a,i){var b=points[(i+1)%4],dx=b[0]-a[0],dy=b[1]-a[1];
     if((x-a[0])*dy-(y-a[1])*dx>0)inside=false;
     var t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
     nearest=Math.min(nearest,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
    });return !inside && nearest>=.71;
   });
  },materialAt:function(){return 'water';},
  materialSlip:{density:[1,matched?2.65:5.2,2.65,matched?2.65:19.3],drag:[600,600,600,4,4,4],separateGold:true,blackSand:true,grainContacts:true,
   bed:{line:[72,176,end,floor(end)],riffles:[312,96,6,height],count:plain?0:sections.length,thickness:8,cleanupPolygons:cleanoutParts}},
  sluice:{polygons:polygons,normalPolygons:polygons,cleanupPolygons:cleanupPolygons,pockets:pockets,sections:sections,tailingsX:end,tailingsY:480,tailings:tank,collection:collection,matched:matched,riffles:!plain,
   lengthInches:length,widthInches:10,wallInches:4.5,pixelsPerInch:unit,slope:slope,riffleHeight:height,
   initialCharge:options.initialCharge!==false,waterSupply:36000,hopper:2400,feedRate:120,feed:{x:224,y:140},feedMaterials:feedMaterials,
   mix:{sand:2202,blackSand:192,gold:6},floor:floor},
  setups:[{id:'ordinary',label:'Classified paydirt',options:{}},{id:'matched-density',label:'Equal mineral densities',options:{matched:true}},
   {id:'no-riffles',label:'Without riffles',options:{riffles:false}}],
  settings:{},boundaries:null,
  source:length===51?{title:'Keene A52: 51 by 10 by 4.5 inches',url:'https://www.keene.store/?Product_Code=A52&Screen=PROD'}:{title:'Keene A51: 36 by 10 by 4.5 inches',url:'https://www.keene.store/mm5/merchant.mvc?Product_Code=A51&Screen=PROD'},
  boundaryNote:'A longitudinal section at 24 world pixels per inch. The 51-inch length, 10-inch width and 4.5-inch side height follow the Keene A52; the 36-inch option follows the A51. Width extends out of the page. Riffle spacing, the thickened collision floor and the cleanout chute are model choices, not a replica of the manufacturer\'s recovery lining. The finite practice hopper holds 2,202 quartz grains, 192 magnetite grains and six gold grains. This is classified, roughly 1.5 mm material; the coarse rocks have already been screened out. The sample is deliberately enriched enough to inspect, not an ore-grade assay. Cleanout lifts the riffles and inserts a solid return chute over the separate concentrate pan. Water must carry the remaining mixed minerals into it. Every admitted particle stays in the world, including concentrate and tailings.',
  energyBudgetStatus:'Water, quartz, magnetite and gold carry separate APIC momentum under common gravity and shared compressive pressure. Pair drag and grain contact impulses are equal and opposite. Density ratios are 1, 2.65, 5.2 and 19.3. Equal mineral densities changes magnetite and gold to quartz density. All grains use the same native contact diameter. The reduced 2D model does not resolve clay cohesion, irregular gravel, gold-flake shape, full 3D turbulence, recovery matting or calibrated recovery efficiency.',
  measure:{source:rect(72,68,128,116),receiver:tank}};
}
root.WSSMachines=root.WSSMachines||{};
root.WSSMachines['gold-sluice-box']={make:make};
})(typeof window!=='undefined'?window:globalThis);
