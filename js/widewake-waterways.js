/* The authored water atlas. Coordinates are metres; no wall clock or rendering.
   Keep the original Reach beds intact so existing voyages remain navigable. */
(function(root){
  'use strict';
  const channels=[
    {id:'lantern',name:'Lantern Water',nodes:[[-550,600,115,9],[-900,390,75,8],[-1180,160,85,8],[-1350,-100,190,9]]},
    {id:'kilns',name:'Potters Run',nodes:[[-1350,-100,190,9],[-1550,-470,68,7],[-1350,-820,75,7],[-1500,-1200,180,8]]},
    {id:'canopy',name:'Gorilla Narrows',nodes:[[-1500,-1200,180,8],[-1900,-1580,70,7],[-2070,-1970,65,7],[-2450,-2400,230,10]]},
    {id:'bells',name:'Drowned Bell Water',nodes:[[-2450,-2400,230,10],[-2760,-2900,72,8],[-2790,-3370,78,8],[-2500,-3900,230,12]]},
    {id:'wheel',name:'Floodwheel Race',nodes:[[-2500,-3900,230,12],[-2080,-4230,100,8],[-1740,-4490,95,8],[-1250,-4700,180,9]]},
    {id:'millrace',name:'Millpond Road',nodes:[[-1250,-4700,180,9],[-650,-4920,90,8],[100,-5100,110,7]]},
    {id:'spill',name:'Heron Spill',nodes:[[-1250,-4700,180,9],[-1040,-4500,70,7],[-750,-4300,85,7]]},
    {id:'reedlink',name:'Basketmakers Cut',nodes:[[-1500,-1200,80,4],[-1050,-1490,48,3],[-690,-1780,40,2.6],[-380,-2200,25,1.8]]},
    {id:'glass',name:'Blackglass Strait',nodes:[[1100,-2100,80,7],[1680,-2200,90,8],[2010,-2470,85,8],[2350,-2700,260,14]]},
    {id:'crown',name:'Cathedral Reach',nodes:[[100,-5100,110,7],[740,-5260,90,8],[1360,-5050,90,9],[2150,-5000,240,14]]},
    {id:'furnace',name:'Furnace Passage',nodes:[[2350,-2700,260,14],[2670,-3130,90,10],[2700,-3500,90,11],[2640,-3860,85,10],[2700,-4200,230,15],[2440,-4620,100,10],[2150,-5000,240,14]]},
    {id:'outside',name:'Leeward Passage',nodes:[[2350,-2700,260,14],[3050,-2980,100,10],[3370,-3540,105,10],[3310,-4160,110,10],[2860,-4780,100,10],[2150,-5000,240,14]]}
  ];
  const ports=[
    {id:'lantern',name:'Lantern Quay',x:-1350,y:-100,description:'Night market on the lake',theme:'lantern'},
    {id:'kilns',name:'Ochre Kilns',x:-1500,y:-1200,description:'Potters on the warm bank',theme:'kilns'},
    {id:'canopy',name:'Canopy Landing',x:-2450,y:-2400,description:'Fruit wharf beneath the trees',theme:'canopy'},
    {id:'bells',name:'Bellwether',x:-2500,y:-3900,description:'The town above the drowned town',theme:'bells'},
    {id:'wheel',name:'Floodwheel',x:-1250,y:-4700,description:'A mill beside the fast water',theme:'wheel'},
    {id:'glass',name:'Cinder Quay',x:2350,y:-2700,description:'Black glass, copper roofs, warm rain',theme:'glass'},
    {id:'crown',name:'Crown Anchorage',x:2150,y:-5000,description:'Shipbreakers beneath basalt spires',theme:'crown'}
  ].map(p=>{const shore={lantern:190,kilns:180,canopy:230,bells:230,wheel:180,glass:260,crown:240}[p.id];const shoreAngle={canopy:-Math.PI/2,wheel:Math.PI/2,glass:-Math.PI/2,crown:Math.PI/2}[p.id]||0;return{...p,shore,shoreAngle,piers:[{x:Math.cos(shoreAngle)*(-shore+35),y:Math.sin(shoreAngle)*(-shore+35),length:85,width:8,alongY:shoreAngle!==0}]};});
  const hazards=[
    {id:'race',name:'Floodwheel race',kind:'race',x:-1910,y:-4360,radius:310,dx:.82,dy:-.57,strength:4.8,period:80,warning:'Cross-current. Keep room on the downstream bank.'},
    {id:'furnace',name:'Lava outfall',kind:'heat',x:2700,y:-3500,radius:125,core:57,damage:12,warning:'Hot water damages every hull. Take the outside passage.'},
    {id:'eye',name:'The Turnglass',kind:'vortex',x:2700,y:-4200,radius:215,strength:5.2,pull:1.1,warning:'Rotating current. Steer across the pull; the rim is calmer.'}
  ];
  const landmarks=[
    {id:'kites',name:'The sailmakers',kind:'kites',x:-810,y:445,scale:1},
    {id:'lanterns',name:'Lantern ferry',kind:'lantern',x:-1170,y:70,scale:1},
    {id:'pots',name:'Ochre terraces',kind:'kilns',x:-1420,y:-650,scale:1.2},
    {id:'orchard',name:'The hanging orchard',kind:'canopy',x:-1770,y:-1560,scale:1.3},
    {id:'gorillas',name:'The quiet troop',kind:'gorilla',x:-2160,y:-1900,scale:1.6},
    {id:'roots',name:'Cathedral roots',kind:'canopy',x:-2380,y:-2120,scale:1.5},
    {id:'herons',name:'The white roost',kind:'roost',x:-2620,y:-2770,scale:1.3},
    {id:'bells',name:'The drowned belfry',kind:'bell',x:-2860,y:-3300,scale:1.4},
    {id:'roofs',name:'Rooftop gardens',kind:'roofs',x:-2710,y:-3790,scale:1.2},
    {id:'wheel',name:'The great floodwheel',kind:'wheel',x:-1890,y:-4430,scale:1.5},
    {id:'falls',name:'A hundred silver threads',kind:'falls',x:-1460,y:-4540,scale:1.4},
    {id:'timber',name:'The log cathedral',kind:'ribs',x:-630,y:-4790,scale:1.1},
    {id:'weavers',name:'Basketmakers bank',kind:'kites',x:-940,y:-1540,scale:1},
    {id:'pumps',name:'Salt windpumps',kind:'wheel',x:160,y:450,scale:.8},
    {id:'ribs',name:'The old leviathan',kind:'ribs',x:-430,y:-840,scale:1.6},
    {id:'reedlights',name:'Glowcap bank',kind:'glow',x:-160,y:-1780,scale:1.5},
    {id:'spires',name:'The organ pipes',kind:'basalt',x:1770,y:-2370,scale:1.5},
    {id:'vent',name:'The red river',kind:'volcano',x:2575,y:-3500,scale:1.5},
    {id:'watch',name:'Turnglass watchtower',kind:'bell',x:2920,y:-4110,scale:1.2},
    {id:'shells',name:'The shell staircase',kind:'ribs',x:3430,y:-3750,scale:1.3},
    {id:'crown',name:'The broken crown',kind:'basalt',x:1550,y:-5140,scale:2},
    {id:'wrecks',name:'The shipbreakers choir',kind:'ribs',x:2500,y:-4740,scale:1.5},
    {id:'willows',name:'The green curtain',kind:'canopy',x:1260,y:-2820,scale:1.2},
    {id:'pool',name:'Kingfishers rest',kind:'roost',x:-810,y:-4210,scale:1.2}
  ];
  const regions={
    home:{name:'Lantern Water',tier:0,color:'#779b91',advice:'Sheltered home water'},
    pottery:{name:'Potters Run',tier:1,color:'#bd9167',advice:'Scattered skiffs'},
    jungle:{name:'Gorilla Narrows',tier:2,color:'#578777',advice:'Fast boats in narrow bends'},
    bells:{name:'Drowned Bell Water',tier:3,color:'#8a9ba8',advice:'Gunboats guard the drowned town'},
    wheel:{name:'Floodwheel Reach',tier:2,color:'#b4a77b',advice:'A strong cross-current'},
    glass:{name:'Blackglass Strait',tier:3,color:'#b48473',advice:'Gunboats beyond the basalt banks'},
    furnace:{name:'Furnace Passage',tier:4,color:'#ca8868',advice:'Hot water and a rotating current'},
    crown:{name:'Crown Water',tier:4,color:'#8f91a5',advice:'Dense mixed patrols'},
    outer:{name:'Outer Sound',tier:2,color:'#7b9dab',advice:'Open approaches to the workboats'}
  };
  function region(x,y,channel){
    if(Math.abs(x-100)<300&&Math.abs(y+5100)<300)return regions.wheel;
    if(!channel){if(x>2400&&y<-2900)return regions.furnace;if(x>1000&&y<-4200)return regions.crown;if(x>1500&&y<-1500)return regions.glass;if(x<-2100&&y<-2800)return regions.bells;if(x<-1700&&y<-1300)return regions.jungle;if(x<-900&&y<-600&&y>-1900)return regions.pottery;}
    if(channel==='lantern'||channel==='yard'||y>-650&&y<1250)return regions.home;
    if(channel==='kilns'||channel==='reedlink'||channel==='cut')return regions.pottery;
    if(channel==='canopy')return regions.jungle;
    if(channel==='bells')return regions.bells;
    if(channel==='wheel'||channel==='spill'||channel==='millrace')return regions.wheel;
    if(channel==='glass')return regions.glass;
    if(channel==='furnace')return regions.furnace;
    if(channel==='outside'||channel==='crown')return regions.crown;
    return y>1250?regions.outer:y<-3000?regions.wheel:regions.pottery;
  }
  function flow(x,y,time,out){
    out.heat=0;out.hazard=null;
    for(const h of hazards){const dx=x-h.x,dy=y-h.y,d=Math.hypot(dx,dy);if(d>=h.radius)continue;
      const edge=1-d/h.radius;out.hazard=h.id;
      if(h.kind==='race'){const speed=h.strength*(.55+.45*Math.sin(time*Math.PI*2/h.period))*edge;out.currentX+=h.dx*speed;out.currentY+=h.dy*speed;}
      if(h.kind==='vortex'){const spin=h.strength*Math.sin(Math.PI*d/h.radius),pull=h.pull*edge,inv=1/Math.max(18,d);out.currentX+=(-dy*spin-dx*pull)*inv;out.currentY+=(dx*spin-dy*pull)*inv;}
      if(h.kind==='heat'){out.heat=h.damage*Math.max(0,1-d/h.core);out.currentX-=edge*.7;out.currentY+=edge*.5;}
    }
    return out;
  }
  function passageRisk(x,y){let cost=0;for(const h of hazards){const d=Math.hypot(x-h.x,y-h.y);if(d<h.radius)cost+=h.kind==='heat'?12*(1-d/h.radius):h.kind==='vortex'?5*(1-d/h.radius):.7*(1-d/h.radius);}return cost;}
  const api={channels,ports,hazards,landmarks,regions,region,flow,passageRisk};root.WidewakeWaterways=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
