// Rebuild the scene chooser's static SVG illustrations. No browser or image runtime needed.
// Each drawing shows a scene's shape or an algorithm's mechanism, rather than a shared camera shot.
// Keep legacy WebP files available for visitors with the v1.70 chooser still cached.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'assets/galaxy-previews');
fs.mkdirSync(dir,{recursive:true});
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
function token(name) { return css.match(new RegExp(name + ':\\s*(#[0-9a-f]+)', 'i'))[1]; }
// Categorical colors from STYLE.md; the neutral ramp comes directly from style.css.
const C = { bg:token('--bg-raised'), panel:token('--bg'), rule:token('--rule'), text:token('--text'),
  gold:'#dfc288', blue:'#8fb3c7', sage:'#9ec79a', coral:'#d9978c', purple:'#b79bc4', clay:'#cf9f78' };
const colors = [C.blue,C.sage,C.gold,C.clay,C.coral,C.purple];
const r = n => Math.round(n * 100) / 100;
const circle = (x,y,rad,c,opacity=1) => `<circle cx="${r(x)}" cy="${r(y)}" r="${rad}" fill="${c}" opacity="${opacity}"/>`;
const line = (x,y,x2,y2,c=C.rule,w=2,extra='') => `<path d="M${r(x)} ${r(y)}L${r(x2)} ${r(y2)}" fill="none" stroke="${c}" stroke-width="${w}" ${extra}/>`;
const rect = (x,y,w,h,c,opacity=1,rad=3) => `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${rad}" fill="${c}" opacity="${opacity}"/>`;
const curve = (points,c,w=2,extra='') => `<path d="M${points.map(p=>p.map(r).join(' ')).join('L')}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
function arrow(points,c=C.gold,w=2.5) { return curve(points,c,w,`marker-end="url(#arrow-${Object.keys(C).find(k=>C[k]===c)})"`); }
function ring(x,y,rad,c,w=2,extra='') { return `<circle cx="${x}" cy="${y}" r="${rad}" fill="none" stroke="${c}" stroke-width="${w}" ${extra}/>`; }
function ellipse(x,y,rx,ry,c,w=2,rotation=0,extra='') {return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="${w}" transform="rotate(${rotation} ${x} ${y})" ${extra}/>`;}
function rng(seed=7) {let s=seed;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function bars(values,y=153,x=35,w=28,gap=12,selected=[],scale=14) {
  return line(x-4,y+3,x+values.length*(w+gap)-gap+4,y+3,C.rule,1)+values.map((v,i)=>rect(x+i*(w+gap),y-v*scale,w,v*scale,selected.includes(i)?C.gold:colors[Math.min(v-1,5)])).join('');
}
function search(id) {
  if(id==='dfs') {
    // A branching maze with one deep active branch and a quiet abandoned fork.
    const nodes=[[33,100],[83,100],[127,48],[171,27],[220,48],[266,27],[127,148],[175,173],[220,148],[266,173],[171,100],[220,100],[266,100]];
    let art='';
    for(const [a,b]of [[0,1],[1,2],[2,3],[3,4],[4,5],[1,6],[6,7],[7,8],[8,9],[2,10],[10,11],[11,12]])art+=line(...nodes[a],...nodes[b],C.rule,2.5);
    art+=curve([nodes[1],nodes[2],nodes[3],nodes[4],nodes[5]],C.clay,2.5,'stroke-dasharray="4 5" opacity=".75"');
    art+=arrow([nodes[4],nodes[3],nodes[2]],C.clay,1.5);
    art+=arrow([nodes[0],nodes[1],nodes[6],nodes[7],nodes[8]],C.gold,4);
    nodes.forEach((p,i)=>{art+=circle(...p,[0,1,6,7,8].includes(i)?5:3,[0,1,6,7,8].includes(i)?C.gold:C.rule);});
    return art+ring(...nodes[8],12,C.gold,1.5)+ring(...nodes[12],9,C.coral,2.5);
  }
  if(id==='astar') {
    // A direct goal bearing meets a wall; the explored corridor bends around it.
    let art='';
    for(let y=0;y<7;y++)for(let x=0;x<13;x++)art+=circle(28+x*22,33+y*22,2,C.rule,.65);
    art+=curve([[48,100],[272,100]],C.blue,1.5,'stroke-dasharray="4 6" opacity=".7"');
    for(let y=0;y<5;y++)for(let x=0;x<2;x++)art+=rect(137+x*21,23+y*23,17,19,C.coral,.6);
    art+=curve([[48,100],[99,136],[133,163],[187,163],[224,139]],C.gold,23,'opacity=".12"');
    art+=arrow([[48,100],[99,136],[133,163],[187,163],[224,139],[272,100]],C.gold,4);
    art+=arrow([[224,139],[272,100]],C.blue,1.5);
    return art+circle(48,100,6,C.text)+ring(272,100,11,C.coral,3)+ring(272,100,19,C.coral,1,'opacity=".4"');
  }
  let art='', start=[1,3], goal=[11,3]; const cell=(x,y,c,o=1)=>rect(20+x*22,25+y*22,17,17,c,o);
  for(let y=0;y<7;y++)for(let x=0;x<13;x++){
    let c=C.rule,o=.42, d=Math.abs(x-start[0])+Math.abs(y-start[1]);
    if(id==='bfs'&&d<7){c=C.gold;o=.18+(7-d)*.07;}
    if(id==='bidir'){let e=Math.abs(x-goal[0])+Math.abs(y-goal[1]);if(d<6){c=C.gold;o=.28+(6-d)*.08;}else if(e<6){c=C.blue;o=.28+(6-e)*.08;}}
    if(id==='wavefront') {const seeds=[[2,1],[10,2],[6,5]];let ds=seeds.map(s=>Math.abs(x-s[0])+Math.abs(y-s[1])), m=Math.min(...ds);if(m<4){c=[C.gold,C.blue,C.sage][ds.indexOf(m)];o=.28+(4-m)*.15;}}
    if(id==='randomflood'&&x<6+2*Math.sin(y*2.2)+Math.cos(x*y)){c=[C.sage,C.gold][(x+y)%2];o=.45+.2*Math.sin(x*2+y);}
    if(id==='dijkstra'&&((x>=4&&x<=8&&y>=2&&y<=4)||(x===9&&y<2))){c=C.coral;o=.6;}
    art+=cell(x,y,c,o);
  }
  const point=([x,y])=>[28.5+x*22,33.5+y*22];
  if(id==='bfs')art+=arrow([[62,100],[133,100]])+ring(...point(start),34,C.gold,1.5,'opacity=".7"');
  if(id==='bidir')art+=arrow([[70,100],[144,100]])+arrow([[250,100],[177,100]],C.blue)+ring(160,100,10,C.text);
  if(id==='dijkstra')art+=arrow([[1,3],[2,3],[3,3],[3,5],[10,5],[10,3],[11,3]].map(point),C.gold,4);
  if(id==='wavefront'){for(const [i,s]of [[2,1],[10,2],[6,5]].entries())art+=circle(...point(s),5,[C.gold,C.blue,C.sage][i])+ring(...point(s),25,[C.gold,C.blue,C.sage][i],1.5);return art;}
  if(id==='randomwalk')art+=arrow([[1,3],[2,3],[2,4],[3,4],[3,3],[2,3],[2,2],[3,2],[4,2],[4,3],[5,3],[5,4],[6,4],[6,3],[5,3],[5,2],[7,2],[7,3],[8,3]].map(point),C.gold,3);
  art+=circle(...point(start),6,C.text)+ring(...point(goal),8,C.coral,3);
  return art;
}
function sorting(id) {
  if(id==='bubble')return bars([2,5,3,1,4,6],155,42,26,16,[1,2])+arrow([[97,65],[107,45],[136,45],[148,75]])+arrow([[148,98],[135,116],[106,116],[99,98]],C.blue);
  if(id==='insertion')return bars([1,2,4,5,3,6],156,42,26,16,[4])+rect(36,166,158,5,C.sage)+arrow([[223,91],[223,39],[149,39],[149,86]])+line(146,94,146,158,C.gold,2,'stroke-dasharray="4 4"');
  if(id==='quick'){
    let art=bars([4,1,6,3,5,2],92,55,25,12,[0],11);
    art+=arrow([[142,110],[106,131]],C.blue)+arrow([[180,110],[218,131]],C.coral);
    art+=bars([1,2,3],176,36,23,8,[],7)+bars([5,6],176,222,23,8,[],7)+rect(156,141,24,35,C.gold);
    return art;
  }
  if(id==='heap'){
    const nodes=[[160,35,6],[90,85,4],[230,85,5],[52,141,1],[125,141,3],[205,141,2]];
    let art='';for(const [a,b]of [[0,1],[0,2],[1,3],[1,4],[2,5]])art+=line(...nodes[a].slice(0,2),...nodes[b].slice(0,2),C.rule,3);
    nodes.forEach(([x,y,v],i)=>{art+=circle(x,y,14+i%2,colors[v-1]);});
    return art+arrow([[180,35],[280,35],[280,163],[227,163]],C.gold)+bars([4,5,6],187,228,17,9,[],5);
  }
  if(id==='bitonic'){
    let art='';for(let i=0;i<6;i++)art+=line(32,38+i*25,288,38+i*25,C.rule,2)+circle(32,38+i*25,5,colors[i])+circle(288,38+i*25,5,colors[i]);
    for(const [x,pairs]of [[75,[[0,1],[2,3],[4,5]]],[143,[[0,3],[1,2],[4,5]]],[210,[[0,5],[1,4],[2,3]]]])for(const [a,b]of pairs)art+=line(x,38+a*25,x,38+b*25,colors[a],3)+circle(x,38+a*25,4,C.gold)+circle(x,38+b*25,4,C.gold);
    return art;
  }
  if(id==='pancake'){
    let art='';for(const [i,v]of [2,5,3,6,4,1].entries())art+=rect(160-v*14,47+i*20,v*28,13,i<3?C.gold:colors[v-1],1,6);
    return art+arrow([[76,103],[48,84],[49,46],[78,27],[119,27],[136,35]])+line(62,106,253,106,C.text,1.5,'stroke-dasharray="5 5"');
  }
}
function life(id){
  const rand=rng(321);
  if(id==='boids'){
    let art='';for(let i=0;i<30;i++){let x=42+rand()*238,y=33+rand()*125,angle=-.7+rand()*.5,size=4+rand()*4;art+=`<path d="M${-size} ${size*.5}L0 0L${-size} ${-size*.5}" fill="none" stroke="${colors[i%3]}" stroke-width="2" stroke-linecap="round" transform="translate(${r(x)} ${r(y)}) rotate(${r(angle*180/Math.PI)})"/>`;}
    return art+arrow([[40,156],[91,158],[139,151],[186,131]],C.blue,1.5);
  }
  if(id==='ocean'){
    let art='';for(let j=0;j<9;j++){const p=[];for(let i=0;i<=72;i++){let x=24+i*3.8,y=61+j*10+Math.sin(i*.15+j*.44)*12+Math.sin(i*.09-j*.2)*7;p.push([x,y]);}art+=curve(p,[C.blue,C.sage,C.text][j%3],j%3===0?2.6:1.2,`opacity="${.4+j*.055}"`);}
    return art;
  }
  if(id==='lsystem'){
    let art='', leaves='';function branch(x,y,len,angle,depth){let xx=x+Math.sin(angle)*len,yy=y-Math.cos(angle)*len;art+=line(x,y,xx,yy,depth<2?C.sage:C.clay,Math.max(1,depth));if(depth===0){leaves+=ellipse(xx,yy,3,6,C.sage,2,angle*180/Math.PI);return;}branch(xx,yy,len*.73,angle-.48,depth-1);branch(xx,yy,len*.72,angle+.46,depth-1);}
    branch(160,179,47,0,4);return ellipse(160,181,35,5,C.rule,1)+art+leaves;
  }
  if(id==='rxndiff'){
    let art=circle(160,100,75,C.panel)+ring(160,100,75,C.rule,2)+ellipse(160,100,35,74,C.rule,1)+ellipse(160,100,73,24,C.rule,1);
    for(let i=0;i<23;i++){let x=(rand()*2-1)*61,y=(rand()*2-1)*61;if(x*x+y*y>3700){i--;continue;}let rad=4+rand()*5;art+=circle(160+x,100+y,rad+3,C.sage,.16)+ellipse(r(160+x),r(100+y),r(rad),r(rad*.72),colors[i%3],3,i*31);}
    return art+arrow([[232,60],[254,75],[259,103]],C.sage,2);
  }

}
function attractor(id){
  // Normalized schematic silhouettes: distinct loop families, with direction dots.
  let art='';
  if(id==='lorenz'){
    for(let side of [-1,1])for(let j=0;j<12;j++){let p=[];for(let i=0;i<=90;i++){let t=i/90*Math.PI*2;p.push([160+side*(53+Math.cos(t)*(14+j*3)),100+Math.sin(t)*(18+j*4)]);}art+=curve(p,side<0?C.blue:C.gold,1,`opacity="${.3+j*.045}"`);}
    return art+curve([[139,139],[163,99],[182,55]],C.text,2)+circle(98,82,4,C.text);
  }
  if(id==='aizawa'){for(let j=0;j<17;j++)art+=ellipse(160,117,24+Math.sin(j/17*Math.PI)*58,15+Math.sin(j/17*Math.PI)*32,colors[j%3],1.5,j*13)+curve([[149,145],[156,94],[158,37],[163,23],[170,48],[164,99]],C.gold,2);return art;}
  if(id==='dadras'){for(const [j,[x,y]]of [[112,64],[205,65],[112,135],[205,136]].entries())for(let i=0;i<8;i++)art+=ellipse(x,y,12+i*4,5+i*3,colors[j],1.3,j*45+i*8);return art+curve([[91,84],[165,48],[218,117],[150,153],[111,67]],C.text,1.4);}
  if(id==='thomas'){for(let j=0;j<21;j++){let p=[];for(let i=0;i<=140;i++){let t=i/140*Math.PI*2;p.push([160+Math.sin(t*3+j*.016)*(64+j*.8),100+Math.sin(t*2+j*.03)*64]);}art+=curve(p,colors[Math.floor(j/7)],.85,'opacity=".75"');}return art;}
  if(id==='clifford'){for(let j=0;j<16;j++){let p=[];for(let i=0;i<=120;i++){let t=i/120*Math.PI*2;p.push([160+(Math.sin(t*2)+Math.cos(t*3+j*.06))*47,100+(Math.sin(t*3)-Math.cos(t*2+j*.06))*34]);}art+=curve(p,colors[j%3],1,'opacity=".7"');}return art;}
}
function fractal(id){
  let art='';
  if(id==='sierpinski'){
    function triangle(a,b,c,d){if(!d){art+=`<path d="M${a.join(' ')}L${b.join(' ')}L${c.join(' ')}Z" fill="${C.blue}" fill-opacity=".2" stroke="${C.gold}" stroke-width="1.5"/>`;return;}const mid=(x,y)=>x.map((v,i)=>(v+y[i])/2),ab=mid(a,b),bc=mid(b,c),ac=mid(a,c);triangle(a,ab,ac,d-1);triangle(ab,b,bc,d-1);triangle(ac,bc,c,d-1);}
    triangle([160,23],[65,172],[255,172],3);return art;
  }
  function square(x,y,size,d){if(!d){art+=rect(x,y,size-2,size-2,C.blue,.75,1);return;}let s=size/3;for(let yy=0;yy<3;yy++)for(let xx=0;xx<3;xx++){if(id==='vicsek'?(xx===1||yy===1):!(xx===1&&yy===1))square(x+xx*s,y+yy*s,s,d-1);}}
  square(79,19,162,id==='vicsek'?3:2);return art+rect(77,17,166,166,C.blue,.05);
}
function numbers(id){
  let art='';
  if(id==='collatz'){
    function branch(x,y,len,a,d){if(!d)return;let xx=x+Math.sin(a)*len,yy=y-Math.cos(a)*len;art+=line(x,y,xx,yy,colors[d%3],Math.max(1,d*.8))+circle(xx,yy,1.8,C.gold);branch(xx,yy,len*.72,a-.46,d-1);branch(xx,yy,len*.8,a+.34,d-1);}
    branch(126,183,48,.12,6);return art;
  }
  if(id==='pi'){let rand=rng(31415),p=[[0,0]],x=0,y=0;for(let i=0;i<125;i++){let angle=Math.floor(rand()*10)*Math.PI*.2;x+=Math.cos(angle)*10;y+=Math.sin(angle)*10;p.push([x,y]);}let lo=[Math.min(...p.map(p=>p[0])),Math.min(...p.map(p=>p[1]))],hi=[Math.max(...p.map(p=>p[0])),Math.max(...p.map(p=>p[1]))];p=p.map(([x,y])=>[35+(x-lo[0])/(hi[0]-lo[0])*250,25+(y-lo[1])/(hi[1]-lo[1])*150]);return curve(p,C.blue,2.5)+circle(...p[0],5,C.sage)+circle(...p.at(-1),5,C.gold);}
  if(id==='recaman'){
    let used=new Set([0]),n=0,vals=[0];for(let i=1;i<27;i++){let next=n-i;if(next<0||used.has(next))next=n+i;used.add(next);vals.push(next);n=next;}let scale=263/Math.max(...vals);art+=line(29,100,291,100,C.rule,1);for(let i=1;i<vals.length;i++){let a=29+vals[i-1]*scale,b=29+vals[i]*scale,rad=Math.abs(b-a)/2;art+=`<path d="M${r(a)} 100A${r(rad)} ${r(rad*.72)} 0 0 ${i%2} ${r(b)} 100" fill="none" stroke="${colors[i%3]}" stroke-width="1.8"/>`;}return art;
  }
  function prime(n){if(n<2)return false;for(let k=2;k*k<=n;k++)if(n%k===0)return false;return true;}
  if(id==='gprimes'){for(let x=-7;x<=7;x++)for(let y=-5;y<=5;y++)if((x===0||y===0)?prime(Math.abs(x||y))&&Math.abs(x||y)%4===3:prime(x*x+y*y))art+=circle(160+x*17,100+y*15,3.8,colors[(Math.abs(x)+Math.abs(y))%3]);return art+line(26,100,294,100,C.rule,1)+line(160,18,160,182,C.rule,1);}
  if(id==='primes3d'){for(let j=0;j<11;j++){let rad=15+j*6;art+=ring(160,100,rad,colors[j%3],j%3===0?3:1,`opacity="${j%3===0?.85:.25}"`);}for(let i=0;i<130;i++){let a=i*2.4,rad=20+(i%8)*7;art+=circle(160+Math.cos(a)*rad,100+Math.sin(a)*rad,1.5,C.gold,.7);}return art;}
}
function geometry(id){
  let art='';
  if(id==='hopf'){for(let j=0;j<12;j++)art+=ellipse(160+Math.cos(j/6*Math.PI)*30,100+Math.sin(j/6*Math.PI)*17,74,39,colors[Math.floor(j/4)],2,j*15);return art;}
  if(id==='metatron'){let nodes=[[160,100]];for(let radius of [39,76])for(let i=0;i<6;i++){let a=i*Math.PI/3;nodes.push([160+Math.cos(a)*radius,100+Math.sin(a)*radius]);}for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)art+=line(...nodes[i],...nodes[j],C.blue,.75,'opacity=".55"');for(const p of nodes)art+=ring(...p,12,C.gold,1.5);return art;}
  if(id==='lotus'){for(let j=0;j<12;j++)art+=`<path d="M160 125Q${75+j*6} ${-4+j*4} ${127+j*6} ${43+Math.abs(j-6)*8}Q${228-j*4} ${65+j*3} 160 125" fill="${colors[Math.floor(j/4)]}" fill-opacity=".1" stroke="${colors[Math.floor(j/4)]}" stroke-width="1.5"/>`;return art+ellipse(160,144,68,14,C.sage,1.5)+circle(160,119,5,C.gold);}
  if(id==='harmonics'){for(let j=0;j<16;j++){let p=[];for(let i=0;i<=160;i++){let t=i/160*Math.PI*2,rad=48+Math.cos(t*5+j*.07)*25;p.push([160+Math.cos(t)*rad,100+Math.sin(t)*rad*.85]);}art+=curve(p,colors[Math.floor(j/6)],1.2,'opacity=".65"');}return art;}
}
const renderers = {};
function emergence(id,preset='') {
  const rand=rng([...id+preset].reduce((n,c)=>n+c.charCodeAt(0)*17,5));let art='';
  if(id==='boids'){
    for(let i=0;i<75;i++){
      const a=i*.23,group=i%2,chaos=preset==='chaos',split=preset==='school';
      const x=chaos?26+rand()*268:split?(group?224:96)+(rand()-.5)*77:160+Math.cos(a)*(.7*i+18),y=chaos?25+rand()*150:split?100+(rand()-.5)*90:100+Math.sin(a)*(.47*i+13);
      const turn=chaos?rand()*360:split?(group?180:0):a*180/Math.PI+90;
      art+=`<path d="M-4 5L1 0L-4-5M-5 0L4 0" fill="none" stroke="${i%7===0?C.gold:C.sage}" stroke-width="1.7" stroke-linecap="round" transform="translate(${r(x)} ${r(y)}) rotate(${r(turn)})"/>`;
    }
    return art;
  }
  if(id==='ants'){
    const nest=[52,103],foods=preset==='scarce'?[[269,103]]:[[251,41],[265,123],[213,168]];
    if(preset==='detour'||preset==='scarce')art+=rect(149,35,8,105,C.rule);
    for(const [j,end]of foods.entries()){
      const mid=preset==='detour'||preset==='scarce'?[160,160]:[137,80+j*24],path=[nest,mid,end];art+=curve(path,C.blue,17,'opacity=".09"')+curve(path,C.blue,3,'opacity=".5"');
      for(let i=0;i<22;i++){const t=rand(),p=t<.5?[nest,mid,t*2]:[mid,end,t*2-1],x=p[0][0]+(p[1][0]-p[0][0])*p[2]+(rand()-.5)*12,y=p[0][1]+(p[1][1]-p[0][1])*p[2]+(rand()-.5)*12;art+=ellipse(r(x),r(y),2.8,1,C.gold,1.5,Math.atan2(p[1][1]-p[0][1],p[1][0]-p[0][0])*180/Math.PI);}
      art+=circle(...end,11,C.sage)+ring(...end,17,C.sage,1,'opacity=".4"');
    }if(preset==='scarce')art+=curve([nest,[158,22],foods[0]],C.gold,3,'opacity=".7"');return art+circle(...nest,17,C.panel)+ring(...nest,17,C.gold,3)+circle(...nest,5,C.gold);
  }

}
for(const id of ['bfs','bidir','astar','dijkstra','wavefront','randomflood','dfs','randomwalk'])renderers[id]=()=>search(id);
for(const id of ['bubble','insertion','quick','heap','bitonic','pancake'])renderers[id]=()=>sorting(id);
for(const id of ['boids','ocean','lsystem','rxndiff'])renderers[id]=()=>life(id);
const emergenceDefinitions=require('../js/random-galaxy-emergence-models.js').definitions;
for(const [id,def]of Object.entries(emergenceDefinitions)){
  renderers[id]=()=>emergence(id);
  for(const [preset,name]of def.presets){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><title>${name}</title><defs>${Object.entries(C).map(([key,c])=>`<marker id="arrow-${key}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${c}"/></marker>`).join('')}</defs><rect width="320" height="200" fill="${C.bg}"/>${emergence(id,preset)}</svg>\n`;fs.writeFileSync(path.join(dir,id+'-'+preset+'.svg'),svg);}
}
for(const id of ['thomas','lorenz','aizawa','dadras','clifford'])renderers[id]=()=>attractor(id);
for(const id of ['sierpinski','jerusalem','vicsek'])renderers[id]=()=>fractal(id);
for(const id of ['collatz','pi','recaman','gprimes','primes3d'])renderers[id]=()=>numbers(id);
for(const id of ['hopf','metatron','lotus','harmonics'])renderers[id]=()=>geometry(id);
renderers.mulberry=()=>{let random=rng(871),art='';for(let i=0;i<170;i++){const x=26+random()*268,y=23+random()*154;art+=circle(x,y,1.5+random()*2,colors[i%3],.45+random()*.55);}return art;};
renderers.grid=()=>{let art='';for(let y=0;y<8;y++)for(let x=0;x<13;x++)art+=circle(40+x*20,30+y*20,2.4,C.blue);return art;};
const html=fs.readFileSync(path.join(root,'random-galaxy.html'),'utf8');
const selects=[...html.matchAll(/<select class="gx-cat-select[\s\S]*?<\/select>/g)];
const scenes=selects.flatMap(m=>[...m[0].matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(m=>({id:m[1],name:m[2]})));
fs.mkdirSync(dir,{recursive:true});
let bytes=0;
for(const {id,name}of scenes){
  if(!renderers[id])throw new Error('No illustration for '+id);
  const art=renderers[id]();if(!art)throw new Error('Empty illustration for '+id);
  const defs=Object.entries(C).filter(([key])=>art.includes('url(#arrow-'+key+')')).map(([key,c])=>`<marker id="arrow-${key}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${c}"/></marker>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><title>${name}</title><defs>${defs}</defs><rect width="320" height="200" fill="${C.bg}"/><g>${art}</g></svg>\n`;
  fs.writeFileSync(path.join(dir,id+'.svg'),svg);bytes+=Buffer.byteLength(svg);
}
process.stdout.write(`Built ${scenes.length} distinct illustrations, ${Math.round(bytes/1024)} KB total\n`);
