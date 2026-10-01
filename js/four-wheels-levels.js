(function (root) {
  'use strict';
  const up = -Math.PI / 2, down = Math.PI / 2;
  const cone = (x, y) => ({ kind: 'cone', x, y });
  const box = (x, y) => ({ kind: 'box', x, y });
  const shelf = (x, y, w, h, label, stock = 'jars') => ({ x, y, w, h, label, stock });
  const levels = [
    {
      name: 'First push', department: '01 / Welcome to the store', limit: 65, par: 30,
      tip: 'One table, one vase. Give it a bump in practice, then try steering past it without spilling the water.',
      start: { x: 76, y: 235, a: up },
      gates: [{ x: 82, y: 80 }, { x: 281, y: 76 }, { x: 392, y: 173 }],
      exit: { side: 'right', center: 249, width: 64 },
      shelves: [{ x: 117, y: 141, w: 32, h: 32, kind: 'table', label: 'ONE VASE' }],
      objects: [],
      signs: [{ x: 68, y: 270, text: 'START HERE' }, { x: 133, y: 195, text: 'ONE VASE' }]
    },
    {
      name: 'Endcap trouble', department: '02 / Household essentials', limit: 75, par: 43,
      tip: 'Swing the nose around the shelf, then push across the slide. Braking buys you room.',
      start: { x: 60, y: 235, a: up },
      gates: [{ x: 63, y: 67 }, { x: 234, y: 70 }, { x: 233, y: 239 }, { x: 411, y: 239 }],
      exit: { side: 'top', center: 417, width: 74 },
      shelves: [shelf(111, 111, 70, 93, 'THE PANTRY', 'groceries'), shelf(289, 108, 68, 96, 'KETCHUP', 'sauces')],
      objects: [cone(95, 66), cone(201, 165), cone(274, 216), cone(375, 169)],
      signs: [{ x: 57, y: 270, text: 'NO SHORTCUTS' }]
    },
    {
      name: 'The dish aisle', department: '03 / Everything is breakable', limit: 80, par: 44,
      tip: 'A cone costs two seconds. A shelf of dishes costs five. Leave room for the person behind the cart.',
      start: { x: 65, y: 240, a: 0 },
      gates: [{ x: 229, y: 237 }, { x: 236, y: 73 }, { x: 408, y: 75 }],
      exit: { side: 'bottom', center: 413, width: 82 },
      shelves: [shelf(99, 103, 82, 70, 'VERY BREAKABLE', 'dishes'), shelf(292, 140, 48, 126, 'ALSO BREAKABLE', 'dishes')],
      objects: [cone(227, 165), cone(270, 117), cone(375, 123), cone(367, 210), box(196, 207)],
      signs: [{ x: 97, y: 72, text: 'CERAMICS' }]
    },
    {
      name: 'Wet floor', department: '04 / A small maintenance issue', limit: 80, par: 43,
      tip: 'The puddle rolls faster and brakes slower. Turn early, and ease off the push before you reach it.',
      start: { x: 62, y: 237, a: up },
      gates: [{ x: 70, y: 69 }, { x: 250, y: 76 }, { x: 275, y: 174 }, { x: 417, y: 150 }],
      exit: { side: 'right', center: 244, width: 80 },
      puddle: { x: 287, y: 132, rx: 85, ry: 63 },
      shelves: [shelf(123, 116, 71, 99, 'DRY TOWELS', 'towels'), shelf(280, 226, 64, 48, 'MOPS', 'plants')],
      objects: [cone(213, 106), cone(357, 109), cone(296, 197), cone(367, 239)],
      signs: [{ x: 290, y: 49, text: 'SOMEONE IS ON IT' }]
    },
    {
      name: 'Some assembly required', department: '05 / The flat-pack department', limit: 85, par: 46,
      tip: 'The boxes can move. They would prefer not to. Use a little reverse to settle a turn.',
      start: { x: 62, y: 76, a: down },
      gates: [{ x: 72, y: 234 }, { x: 214, y: 234 }, { x: 216, y: 77 }, { x: 326, y: 99 }, { x: 326, y: 233 }, { x: 424, y: 232 }],
      exit: { side: 'top', center: 427, width: 72 },
      shelves: [shelf(126, 30, 51, 133, 'FLAT PACK', 'boxes'), shelf(255, 141, 48, 135, 'SOME ASSEMBLY', 'boxes'), shelf(349, 31, 39, 131, 'ONE SCREW LEFT', 'boxes')],
      objects: [box(197, 169), box(325, 110), box(115, 202), cone(219, 219), cone(406, 183)],
      signs: [{ x: 78, y: 48, text: 'WAREHOUSE' }]
    },
    {
      name: 'Closing time', department: '06 / Last cart out', limit: 70, par: 40,
      tip: 'A full lap, a few loose boxes, and one final exit. The store closes when the clock runs out.',
      start: { x: 61, y: 243, a: up },
      gates: [{ x: 61, y: 68 }, { x: 239, y: 68 }, { x: 240, y: 242 }, { x: 417, y: 239 }],
      exit: { side: 'top', center: 418, width: 78 },
      shelves: [shelf(113, 110, 65, 94, 'LAST CHANCE', 'dishes'), shelf(301, 103, 54, 98, 'LAST BOTTLES', 'wine')],
      objects: [cone(204, 117), cone(274, 170), cone(385, 123), box(265, 215), box(90, 81), cone(371, 218)],
      puddle: { x: 241, y: 154, rx: 34, ry: 42 },
      signs: [{ x: 64, y: 274, text: 'CLOSING IN ONE MINUTE' }]
    }
  ];
  // The departments are physical neighbors, joined by open floor corridors.
  // Selecting a later start skips earlier route marks, not the world itself.
  const positions = [[0,0],[520,0],[1040,0],[1040,340],[520,340],[0,340]];
  const themes = ['coral','sage','purple','blue','gold','clay'];
  levels.forEach((l,i) => {
    l.theme=themes[i]; l.index=i;
    l.exit={side:i<2?'right':i===2?'bottom':'left',center:i===0?249:i===1?70:i===2?417:244,width:88};
    if(i>=4) {
      l.start={...l.start,x:480-l.start.x,a:Math.PI-l.start.a};
      l.gates=l.gates.map(p=>({...p,x:480-p.x}));
      l.shelves=l.shelves.map(p=>({...p,x:480-p.x-p.w}));
      l.objects=l.objects.map(p=>({...p,x:480-p.x}));
      l.signs=l.signs.map(p=>({...p,x:480-p.x}));
      if(l.puddle)l.puddle={...l.puddle,x:480-l.puddle.x};
    }
    l.hazards=[];l.cliffs=[];
  });
  levels[1].puddle={x:237,y:160,rx:24,ry:22};
  levels[1].start={x:66,y:249,a:0};
  levels[2].start={x:66,y:70,a:0};
  levels[3].start={x:417,y:66,a:Math.PI/2};
  levels[4].start={x:414,y:244,a:Math.PI};
  levels[5].start={x:414,y:244,a:Math.PI};
  levels[2].gates=[{x:70,y:70},{x:70,y:237},...levels[2].gates];
  levels[2].cliffs=[{side:'right',low:165,high:280}];
  levels[3].name='The indoor lake';
  levels[3].tip='That blue water has no floor under it. Keep the wheels on the tiles and take the bridge around the lake.';
  delete levels[3].puddle;
  levels[3].hazards=[{kind:'lake',x:291,y:151,rx:84,ry:43}];
  levels[3].gates=[{x:418,y:75},{x:281,y:65},{x:196,y:75},{x:176,y:156},{x:94,y:237}];
  levels[3].objects=[cone(381,135),cone(218,215),cone(361,224)];
  levels[3].shelves=[shelf(80,75,62,72,'BEACH TOWELS','towels'),shelf(278,222,64,48,'WATERING CANS','plants')];
  levels[3].signs=[{x:300,y:51,text:'YES, AN ACTUAL LAKE'},{x:198,y:219,text:'STAY ON THE TILES'}];
  levels[4].cliffs=[{side:'bottom',low:260,high:402}];
  levels[4].tip='The yellow edge is a drop, not a wall. Give yourself room to stop before the unguarded side.';
  levels[5].name='The garden exit';
  levels[5].tip='One last lake, then checkout. Any wheel can touch a marker. Get the whole cart through the final exit.';
  delete levels[5].puddle;
  levels[5].hazards=[{kind:'lake',x:245,y:151,rx:44,ry:43}];
  levels[5].shelves[1].x=110;
  levels[5].gates=[{x:419,y:68},{x:241,y:68},{x:183,y:80},{x:183,y:226},{x:240,y:242},{x:63,y:239}];
  levels[5].exit={side:'left',center:244,width:88};
  levels[5].signs=[{x:394,y:271,text:'THE GARDEN'},{x:243,y:205,text:'DEEP WATER'}];
  function journey(startRoom=0) {
    startRoom=Math.max(0,Math.min(5,Math.floor(startRoom)));
    const rooms=levels.map((l,i)=>({...l,index:i,x:positions[i][0],y:positions[i][1]}));
    const shift=(p,r)=>({...p,x:p.x+r.x,y:p.y+r.y,room:r.index,theme:r.theme});
    const gates=rooms.flatMap(r=>r.gates.map((p,i)=>({...shift(p,r),number:i+1})));
    const portals=[],floorAreas=[],walls=[];
    const gaps=rooms.map(()=>({left:[],right:[],top:[],bottom:[]}));
    let opensAt=0;
    for(let i=0;i<5;i++) {
      const r=rooms[i],next=rooms[i+1],e=r.exit,vertical=e.side==='left'||e.side==='right';
      const nx=e.side==='right'?1:e.side==='left'?-1:0,ny=e.side==='bottom'?1:0;
      const x=r.x+(vertical?(nx>0?472:8):e.center),y=r.y+(vertical?e.center:292);
      const low=(vertical?y:x)-e.width/2,high=low+e.width;
      opensAt+=r.gates.length;
      const p={side:e.side,x,y,a:Math.atan2(ny,nx),nx,ny,vertical,width:e.width,low,high,from:i,to:i+1,opensAt};
      portals.push(p);
      gaps[i][e.side].push([e.center-e.width/2,e.center+e.width/2]);
      const opposite=nx>0?'left':nx<0?'right':'top';
      const center=vertical?y-next.y:x-next.x;
      gaps[i+1][opposite].push([center-e.width/2,center+e.width/2]);
      const endX=next.x+(nx>0?8:472),endY=next.y+8;
      const area=vertical?{x:Math.min(x,endX),y:low,w:Math.abs(endX-x),h:e.width}:{x:low,y,w:e.width,h:endY-y};
      floorAreas.push(area);
      if(vertical)for(const yy of [low-8,high])walls.push({x:area.x,y:yy,w:area.w,h:8,side:'corridor'});
      else for(const xx of [low-8,high])walls.push({x:xx,y:area.y,w:8,h:area.h,side:'corridor'});
      p.barrier=vertical?{x:x-2,y:low,w:4,h:e.width,side:'door'}:{x:low,y:y-2,w:e.width,h:4,side:'door'};
      // The entry is on the inside of the next room, in the direction of travel.
      next.entry={x:(vertical?endX:x)+nx*58,y:(vertical?y:endY)+ny*58,a:Math.atan2(ny,nx)};
    }
    const last=rooms[5],e=last.exit;
    gaps[5][e.side].push([e.center-e.width/2,e.center+e.width/2]);
    const exit={...e,center:e.center+last.y,bounds:{left:last.x+8,right:last.x+472,top:last.y+8,bottom:last.y+292}};
    const exitX=last.x+8,exitY=last.y+e.center;
    floorAreas.push({x:exitX-88,y:exitY-e.width/2,w:88,h:e.width});
    for(const r of rooms) {
      floorAreas.push({x:r.x+8,y:r.y+8,w:464,h:284,room:r.index});
      for(const c of r.cliffs)gaps[r.index][c.side].push([c.low,c.high]);
      for(const side of ['left','right','top','bottom']) {
        const vertical=side==='left'||side==='right',end=vertical?292:472;
        let cursor=8;
        const runs=gaps[r.index][side].sort((a,b)=>a[0]-b[0]);
        for(const [a,b]of [...runs,[end,end]]) {
          if(a>cursor)walls.push(vertical?{x:r.x+(side==='left'?0:472),y:r.y+cursor,w:8,h:a-cursor,side,room:r.index}:{x:r.x+cursor,y:r.y+(side==='top'?0:292),w:a-cursor,h:8,side,room:r.index});
          cursor=Math.max(cursor,b);
        }
      }
      r.openings=gaps[r.index];r.spawn=r.entry||shift(r.start,r);
    }
    const start=shift(rooms[startRoom].start,rooms[startRoom]);
    const startGate=rooms.slice(0,startRoom).reduce((n,r)=>n+r.gates.length,0);
    return {name:'The whole store',connected:true,rooms,portals,floorAreas,walls,gates,start,startRoom,startGate,exit,
      bounds:{left:0,right:1520,top:0,bottom:640},
      limit:rooms.slice(startRoom).reduce((n,r)=>n+r.limit,0)+30,par:rooms.slice(startRoom).reduce((n,r)=>n+r.par,0)+20,
      shelves:rooms.flatMap(r=>r.shelves.map(p=>shift(p,r))),objects:rooms.flatMap(r=>r.objects.map(p=>shift(p,r))),
      hazards:rooms.flatMap(r=>r.hazards.map(p=>shift(p,r))),puddles:rooms.filter(r=>r.puddle).map(r=>shift(r.puddle,r)),signs:[]};
  }
  levels.journey=journey;
  if (typeof module !== 'undefined' && module.exports) module.exports = levels;
  else root.CartLevels = levels;
})(typeof globalThis !== 'undefined' ? globalThis : this);
